#!/usr/bin/env node
//
// check-conditional-renders.mjs — fail if a template renders a scaffold whose
// imports point at files the render left out.
//
// A `conditionals` entry drops a file when its expression is false. Nothing
// drops the imports of that file from the modules that survive, so a file
// entering on `A` while importing one gated on `A && B` produces a scaffold
// that cannot compile — at `A && !B` only, which is a combination no other
// gate reaches.
//
// check-catalog-renders.mjs probes each template once and skips any variable
// carrying a default (`probeAll`), so a bool conditional defaulting to true is
// only ever rendered true. template-doctor typechecks `skeleton/` directly,
// where every conditional file is present. Between them the default path is
// well covered and no other path is covered at all.
//
// This renders every combination of the bool variables a template's own
// conditionals name, and resolves every relative import in the result against
// the files that render alongside it.
//
// Usage: node scripts/check-conditional-renders.mjs [root]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import _ts from "typescript";
import { renderTemplate } from "../sdk/dist/renderer.js";
import { LocalSource } from "../sdk/dist/sources/local.js";

// TypeScript ships CommonJS; the ESM shim exposes the API as the default.
const ts = _ts.default ?? _ts;

const root = resolve(process.argv[2] ?? ".");
const source = new LocalSource({ rootDir: root });

// 2^6 renders of one template is already 64 passes over its skeleton. A
// template with more bool conditionals than this is telling you its variables
// have grown into a configuration language, which is a design finding rather
// than something to brute-force.
const MAX_BOOL_VARIABLES = 6;

const CANDIDATES = ["myapp", "my-app", "my_app", "MyApp", "my.app", "1"];

/**
 * Importer/specifier pairs the catalog already breaks on, keyed
 * `<template> <file> <specifier>`.
 *
 * Each is a barrel or an entry point importing a conditional file
 * unconditionally: one defect, fixed once, by guarding the import with the
 * condition its target carries or moving what the importer needs into a file
 * that renders beside it.
 *
 * A hit outside this list fails, and an entry that stops reproducing fails
 * too, so the list can only shrink.
 *
 * What the key does not scope, and what the list therefore says nothing about:
 *
 *   - The combination. One entry excuses its pair at every combination, not
 *     only the one that surfaced it, because the pair is the defect and the
 *     combination is how it shows.
 *   - Anything but relative specifiers in `.ts`, `.tsx`, `.js`, `.jsx`,
 *     `.mts` and `.cts` files. A bare specifier is a package, and a broken
 *     reference from a `.json`, `.yaml`, `.md` or asset file is invisible here.
 *   - Whether a rendered tree typechecks, builds or passes its tests. This
 *     resolves specifiers; it runs no toolchain.
 *   - A bool variable used only in an inline `#if` marker. `switchedVariables`
 *     reads the names in `conditionals[].when`, so a flag that gates lines
 *     rather than files is never varied.
 */
const KNOWN_BROKEN = new Set([
  "agentic-loop src/agent.ts ./memory/conversation.js",
  "fine-tune-pipeline src/index.ts ./eval/compare.js",
  "guardrails src/guardrails/filters/__tests__/pipeline.test.ts ../content-policy.js",
  "guardrails src/guardrails/filters/index.ts ./content-policy.js",
  "guardrails src/guardrails/filters/index.ts ./pii.js",
  "guardrails src/guardrails/index.ts ./filters/content-policy.js",
  "mcp-server-ts src/server.ts ./resources/example.js",
  "module-llm-providers src/llm-providers/providers/index.ts ./bedrock.js",
  "module-llm-providers src/llm-providers/providers/index.ts ./huggingface.js",
  "module-llm-providers src/llm-providers/providers/index.ts ./ollama.js",
  "module-llm-providers src/llm-providers/providers/index.ts ./vertex.js",
  "module-notifications-ts src/notifications/channels/index.ts ./push/index.js",
  "module-notifications-ts src/notifications/channels/index.ts ./sms/index.js",
  "module-observability-ts src/telemetry/index.ts ./tracer.js",
  "monorepo packages/shared-ui/src/index.test.ts ./index.js",
  "monorepo packages/shared-utils/src/index.test.ts ./index.js",
  "multimodal-pipeline src/processors/index.ts ./audio.js",
  "multimodal-pipeline src/processors/index.ts ./video.js",
  "prompt-library sdk/src/__tests__/loader.test.ts ../index.js",
  "prompt-library sdk/src/__tests__/loader.test.ts ../types.js",
  "slack-bot src/index.ts ./commands/ask.js",
  "worker-service src/worker/__tests__/scheduler.test.ts ../scheduler/cron.js",
  "worker-service src/worker/index.ts ./scheduler/cron.js",
  "worker-service src/worker/index.ts ./scheduler/jobs/example.js",
]);

/** A value satisfying the variable's declared constraints, or null. */
function probeValue(variable) {
  // A declared default is the value the template says it wants, and it is
  // already valid by construction.
  if ("default" in variable) return String(variable.default);
  if (Array.isArray(variable.options) && variable.options.length > 0) {
    return String(variable.options[0]);
  }
  if (variable.type === "bool") return "true";
  if (variable.type === "number") return "1";
  const pattern = variable.validation?.pattern;
  if (!pattern) return CANDIDATES[0];
  const re = new RegExp(`^(?:${pattern})$`);
  return CANDIDATES.find((c) => re.test(c)) ?? null;
}

/** The bool variables this template's conditionals actually branch on. */
function switchedVariables(manifest) {
  const named = new Set();
  for (const cond of manifest.conditionals ?? []) {
    for (const word of String(cond.when ?? "").match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) {
      named.add(word);
    }
  }
  return (manifest.variables ?? []).filter((v) => v.type === "bool" && named.has(v.name));
}

/** Every assignment of true/false across `vars`. */
function combinations(vars) {
  let out = [{}];
  for (const v of vars) {
    out = out.flatMap((base) => [
      { ...base, [v.name]: "true" },
      { ...base, [v.name]: "false" },
    ]);
  }
  return out;
}

/**
 * Every module specifier a file references, taken from the parsed module
 * rather than matched in its text.
 *
 * A pattern over source is a claim about the spellings its author thought of.
 * The catalog writes seven: a default or named import, a type-only import, a
 * side-effect import, a namespace import, `export … from`, `export type … from`
 * and a dynamic `import()`. A regex that forbade a newline between `import`
 * and `from` was blind to every specifier list wrapped across lines, and to
 * dynamic imports entirely. `__tests__/conditional-renders.test.mjs` pins the
 * extractor against all seven.
 */
export function moduleSpecifiers(source, fileName = "file.ts") {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const found = [];
  const record = (node) => {
    if (node && ts.isStringLiteralLike(node)) found.push(node.text);
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        record(node.moduleReference.expression);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      if (isDynamicImport || isRequire) record(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return found;
}

/** The relative ones. A bare specifier is a package, not a file in the tree. */
export function relativeImports(source, fileName) {
  return moduleSpecifiers(source, fileName).filter((s) => s.startsWith("."));
}

/**
 * Files whose imports this resolves. Exported so the suite that pins the
 * extractor reads the same set the gate scans — two lists would disagree, and
 * the one in the suite would stop covering what the gate looks at.
 *
 * `.mjs` and `.cjs` are here because the catalog ships build files with those
 * extensions in templates that carry bool conditionals, which is the shape
 * this gate exists to catch.
 */
export const SOURCE_FILE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/;

/**
 * Resolve one specifier the way a bundler would: the literal path, the same
 * path with a TypeScript extension, `.js` rewritten to `.ts`, or a directory
 * index. Only a specifier no candidate satisfies is reported.
 */
function resolves(fromPath, specifier, present) {
  const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  const withoutExt = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${withoutExt}.ts`,
    `${withoutExt}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  return candidates.some((c) => present.has(c));
}

// Importing this module for its extractor must not run the gate. Without this
// the sweep executes on import and its `process.exit` kills the importing
// process, so the suite that pins the extractor would run none of its
// assertions whenever the catalog is red — the suite disabled by the thing it
// exists to check.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const templatesDir = join(root, "templates");
  const names = readdirSync(templatesDir)
    .filter((n) => existsSync(join(templatesDir, n, "template.yaml")))
    .sort();

  if (names.length === 0) {
    console.error(
      "check-conditional-renders: found no templates/*/template.yaml — the walk matched " +
        "nothing, so this gate is asserting nothing.",
    );
    process.exit(2);
  }

  const broken = [];
  const seenKnown = new Set();
  const unsatisfiable = [];
  let templatesProbed = 0;
  let rendersChecked = 0;

  for (const name of names) {
    const manifest = yaml.load(readFileSync(join(templatesDir, name, "template.yaml"), "utf-8"));
    const switched = switchedVariables(manifest);
    if (switched.length === 0) continue;
    if (switched.length > MAX_BOOL_VARIABLES) {
      unsatisfiable.push(
        `${name}: ${switched.length} bool conditionals exceeds the ${MAX_BOOL_VARIABLES} this gate renders`,
      );
      continue;
    }

    const base = {};
    let skip = false;
    for (const v of manifest.variables ?? []) {
      if (switched.some((s) => s.name === v.name)) continue;
      const probed = probeValue(v);
      if (probed === null) {
        unsatisfiable.push(`${name}: no candidate satisfies ${v.name}`);
        skip = true;
        break;
      }
      base[v.name] = probed;
    }
    if (skip) continue;

    templatesProbed += 1;
    const { files } = await source.fetchTemplate(name);

    for (const combo of combinations(switched)) {
      rendersChecked += 1;
      const rendered = renderTemplate(manifest, files, { ...base, ...combo });
      const present = new Set(rendered.files.map((f) => f.path));
      const label = Object.entries(combo)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");

      for (const file of rendered.files) {
        if (!SOURCE_FILE.test(file.path)) continue;
        for (const specifier of relativeImports(file.content, file.path)) {
          if (resolves(file.path, specifier, present)) continue;
          const key = `${name} ${file.path} ${specifier}`;
          if (KNOWN_BROKEN.has(key)) {
            seenKnown.add(key);
            continue;
          }
          broken.push(`${name} [${label}]  ${file.path} imports '${specifier}' — not rendered`);
        }
      }
    }
  }

  if (unsatisfiable.length) {
    console.error(
      `check-conditional-renders: ${unsatisfiable.length} template(s) could not be probed.\n`,
    );
    for (const u of unsatisfiable) console.error(`  ${u}`);
    process.exit(2);
  }

  if (templatesProbed === 0) {
    console.error(
      "check-conditional-renders: no template declares a bool conditional. The catalog " +
        "ships templates that do, so this is the walk breaking rather than the catalog " +
        "losing them.",
    );
    process.exit(2);
  }

  const stale = [...KNOWN_BROKEN].filter((k) => !seenKnown.has(k));
  if (stale.length) {
    console.error(
      `check-conditional-renders: ${stale.length} entr(ies) in the known-broken list no longer\n` +
        `reproduce. Delete them — a list that outlives what it describes stops being a record\n` +
        `of debt and starts being permission.\n`,
    );
    for (const s of stale) console.error(`  ${s}`);
    process.exit(1);
  }

  if (broken.length) {
    console.error(
      `check-conditional-renders: ${broken.length} import(s) point at a file the render left out.\n` +
        `A conditional drops a file; nothing drops the imports of it from the modules that\n` +
        `survive. Either gate the importer on the same condition, or move what it needs into\n` +
        `a file that renders alongside it.\n`,
    );
    for (const b of broken) console.error(`  ${b}`);
    process.exit(1);
  }

  console.log(
    `check-conditional-renders: ${templatesProbed} template(s) with bool conditionals, ` +
      `${rendersChecked} render(s) across every combination — every relative import resolves ` +
      `to a file rendered beside it, except the ${seenKnown.size} enumerated as known-broken.`,
  );
}
