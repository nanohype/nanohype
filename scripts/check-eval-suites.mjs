#!/usr/bin/env node
//
// check-eval-suites.mjs — every AI surface the catalog ships carries an eval
// suite, and every suite has something in it.
//
// A template whose skeleton depends on a model-provider SDK puts a non-deterministic component on a consumer's
// critical path. Unit tests cover the code around it; nothing covers what the
// model does. That is what an eval suite is for, and it is the tenth
// dimension of `standards/quality-rubric-dimensions.json` — "eval suites for
// non-deterministic components".
//
// Three shapes fail here, and the third is why the second is not enough:
//
//   1. No eval suite at all — the surface ships with a happy-path demo.
//
//   2. An `eval` script whose entry point is not in the skeleton, so the
//      command a consumer runs on their first commit cannot start.
//
//   3. A suite with no cases, or with cases of only one kind. A runner that
//      loads nothing and exits 0 reports a passing eval over an empty corpus,
//      which reads exactly like a passing eval. A suite of golden cases only
//      says nothing about what the surface does under input that is trying to
//      break it.
//
// Case files are validated against schemas/eval-case.schema.json, so
// `kind: adversarial` is a claim about the case rather than about its
// filename, and a case cannot carry an empty assertion list.
//
// Usage: node scripts/check-eval-suites.mjs [root]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import _Ajv2020 from "ajv/dist/2020.js";
import * as yaml from "js-yaml";

const root = resolve(process.argv[2] ?? ".");
const CASE_SCHEMA = resolve(root, "schemas/eval-case.schema.json");

const Ajv2020 = _Ajv2020.default ?? _Ajv2020;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateCase = ajv.compile(JSON.parse(readFileSync(CASE_SCHEMA, "utf-8")));

// The category the catalog uses for surfaces whose product is the model's
// behaviour. Read from the manifest rather than inferred, so a template moves
// in and out of scope by declaring what it is.
const AI_CATEGORY = "ai-systems";

/** The TypeScript provider SDK the LLM policy names, so the two cannot drift. */
function rubricSdkForTypeScript() {
  const policyPath = resolve(root, "standards/llm-policy.json");
  if (!existsSync(policyPath)) return null;
  const policy = JSON.parse(readFileSync(policyPath, "utf-8"));
  return policy.content?.sdk_by_language?.typescript ?? null;
}

/** True when the skeleton declares a dependency on a model-provider SDK. */
export function dependsOnProvider(packageJson) {
  const declared = Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
  });
  return declared.some((name) => PROVIDER_PACKAGES.has(name));
}

/**
 * The packages a skeleton depends on to reach a model.
 *
 * Scope is decided by what a template *declares* — its category, and the
 * dependencies in its `package.json` — not by how it spells a call. A list of
 * call spellings is a list of the ones its author thought of: the same
 * Anthropic SDK's `messages.stream` is a model call and would not have been on
 * it, so a template could leave scope, lose its whole eval suite, and keep the
 * gate green. Leaving scope means removing a dependency.
 *
 * The Bedrock entry is read from `standards/llm-policy.json`, which names the
 * SDK per language. The direct-API packages sit beside it, and
 * `__tests__/eval-suites.test.mjs` walks every dependency declared across the
 * catalog's ai-systems skeletons so a provider package missing from this set
 * fails there rather than narrowing scope in silence.
 */
const PROVIDER_PACKAGES = new Set(
  [
    rubricSdkForTypeScript(),
    "@anthropic-ai/sdk",
    "openai",
    "@google/generative-ai",
    "@google/genai",
    "@mistralai/mistralai",
    "cohere-ai",
    "groq-sdk",
  ].filter(Boolean),
);

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "build"]);
const EVAL_DIRS = new Set(["eval", "evals", "suites"]);
const CASE_FILE = /\.(json|ya?ml)$/;

/** Every file under a directory, as directory-relative POSIX paths. */
function walk(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, acc);
    else acc.push(relative(base, full).split("\\").join("/"));
  }
  return acc;
}

/** Case files live under a directory named for evals, at any depth. */
function caseFiles(files) {
  return files.filter(
    (f) => CASE_FILE.test(f) && f.split("/").some((segment) => EVAL_DIRS.has(segment)),
  );
}

function parseCase(absPath) {
  const text = readFileSync(absPath, "utf-8");
  return absPath.endsWith(".json") ? JSON.parse(text) : yaml.load(text);
}

// Importing this module for its predicates must not run the gate.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const templatesDir = join(root, "templates");
  const names = readdirSync(templatesDir)
    .filter((n) => existsSync(join(templatesDir, n, "template.yaml")))
    .sort();

  if (names.length === 0) {
    console.error(
      "check-eval-suites: found no templates/*/template.yaml — the walk matched nothing, " +
        "so this gate is asserting nothing.",
    );
    process.exit(2);
  }

  /**
   * Templates depending on a model-provider SDK that carry no eval suite yet,
   * keyed by template name.
   *
   * Each is an AI surface a consumer scaffolds with no eval corpus. Enumerated
   * rather than tolerated: a template outside this list fails, and an entry that
   * gains a suite fails too, so the list can only shrink.
   *
   * The list is derived from the tree — every in-scope template with no `eval`
   * script — not from a judgement about which AI surfaces deserve evals. All of
   * them do; these are the ones not yet done.
   */
  const KNOWN_WITHOUT_SUITE = new Set([
    "chrome-ext",
    "discord-bot",
    "electron-app",
    "module-llm-gateway",
    "module-llm-providers",
    "module-semantic-cache",
    "next-app",
    "slack-bot",
    "vscode-ext",
  ]);

  const missingSuite = [];
  const suiteArrived = [];
  const missingEntry = [];
  const emptySuite = [];
  const oneSided = [];
  const badCases = [];
  let inScope = 0;
  let casesChecked = 0;

  for (const name of names) {
    const skeleton = join(templatesDir, name, "skeleton");
    if (!existsSync(skeleton)) continue;

    const manifestPkgPath = join(skeleton, "package.json");
    const manifestPkg = existsSync(manifestPkgPath)
      ? JSON.parse(readFileSync(manifestPkgPath, "utf-8"))
      : {};
    if (!dependsOnProvider(manifestPkg)) continue;

    const files = walk(skeleton);

    const packageJson = manifestPkg;

    inScope += 1;
    const where = `templates/${name}/skeleton`;

    const scripts = packageJson.scripts ?? {};
    const evalScript = Object.entries(scripts).find(([key]) => /^eval(:|$)/.test(key));

    if (!evalScript) {
      if (!KNOWN_WITHOUT_SUITE.has(name)) {
        missingSuite.push(`${where}  declares no 'eval' script`);
      }
      continue;
    }
    if (KNOWN_WITHOUT_SUITE.has(name)) {
      suiteArrived.push(`${name}  ships an eval script — remove it from KNOWN_WITHOUT_SUITE`);
    }

    // The command has to be able to start. A script naming a file the skeleton
    // does not ship fails on a consumer's first commit, which is the one run
    // nobody is watching for.
    const entry = (evalScript[1].match(/(?:^|\s)((?:src|bin|evals?)\/[\w./-]+\.[a-z]+)/) ?? [])[1];
    if (entry && !existsSync(join(skeleton, entry))) {
      missingEntry.push(`${where}  'npm run ${evalScript[0]}' runs ${entry}, which is not shipped`);
    }

    const cases = caseFiles(files);
    const kinds = { golden: 0, adversarial: 0 };
    for (const file of cases) {
      let parsed;
      try {
        parsed = parseCase(join(skeleton, file));
      } catch (err) {
        badCases.push(
          `${where}/${file}  does not parse: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
      // Two shapes are in use and both are fine: one case per file, or a suite
      // file carrying a `cases` array. A directory named for evals can also hold
      // configuration, which declares neither and is skipped.
      if (!parsed || typeof parsed !== "object") continue;
      const found = Array.isArray(parsed.cases) ? parsed.cases : "kind" in parsed ? [parsed] : [];
      for (const one of found) {
        casesChecked += 1;
        if (!validateCase(one)) {
          const detail = (validateCase.errors ?? [])
            .map((e) => `${e.instancePath || "/"} ${e.message}`)
            .join("; ");
          badCases.push(`${where}/${file}  ${one?.name ?? "(unnamed)"}: ${detail}`);
          continue;
        }
        kinds[one.kind] += 1;
      }
    }

    if (kinds.golden + kinds.adversarial === 0) {
      emptySuite.push(`${where}  ships an eval script and no cases`);
      continue;
    }
    if (kinds.golden === 0) oneSided.push(`${where}  has no golden case`);
    if (kinds.adversarial === 0) oneSided.push(`${where}  has no adversarial case`);
  }

  if (inScope === 0) {
    console.error(
      `check-eval-suites: no template declares category '${AI_CATEGORY}' with a provider SDK ` +
        `dependency. ` +
        "The catalog ships templates that do, so this is the walk breaking rather than the " +
        "catalog losing them.",
    );
    process.exit(2);
  }

  let failed = false;
  const report = (hits, headline, explanation) => {
    if (hits.length === 0) return;
    failed = true;
    console.error(`\ncheck-eval-suites: ${hits.length} ${headline}\n${explanation}`);
    for (const hit of hits) console.error(`  ${hit}`);
  };

  report(
    suiteArrived,
    "entr(ies) in the known-without-suite list ship a suite.",
    "A list that outlives what it describes stops being a record of what is left and starts\n" +
      "being permission. Delete the entry.",
  );
  report(
    missingSuite,
    "AI surface(s) ship no eval suite.",
    "A non-deterministic component with only a happy-path demo is a prototype. Add an\n" +
      "`eval` script and cases beside it — golden for what the surface is for, adversarial\n" +
      "for input trying to make it do something else.",
  );
  report(
    missingEntry,
    "eval script(s) name an entry point the skeleton does not ship.",
    "The command fails on a consumer's first commit, which is the run nobody watches.",
  );
  report(
    emptySuite,
    "eval suite(s) hold no cases.",
    "A runner that loads nothing and exits 0 reports a pass over an empty corpus, which\n" +
      "reads exactly like a pass. The suite has to have something in it.",
  );
  report(
    oneSided,
    "eval suite(s) cover only one kind of case.",
    "Golden cases say what the surface does when asked nicely. Adversarial cases are the\n" +
      "ones that find out what it does otherwise, and a suite without them has not looked.",
  );
  report(
    badCases,
    "case file(s) do not meet schemas/eval-case.schema.json.",
    "The schema is what makes `kind: adversarial` a claim about the case rather than about\n" +
      "its filename, and what stops a case passing with an empty assertion list.",
  );

  if (failed) process.exit(1);

  console.log(
    `check-eval-suites: ${inScope} template(s) depend on a model-provider SDK. ` +
      `${inScope - KNOWN_WITHOUT_SUITE.size} carry an eval suite: each declares an eval script ` +
      `whose entry it ships, and golden and adversarial cases valid against the case schema ` +
      `(${casesChecked} checked). The remaining ${KNOWN_WITHOUT_SUITE.size} are enumerated in ` +
      `KNOWN_WITHOUT_SUITE and fail this gate the moment one is removed from it.`,
  );
}
