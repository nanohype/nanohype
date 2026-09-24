#!/usr/bin/env node
//
// check-standards-applicability.mjs — hold what a grader derives from the
// standards to the files it derives it from.
//
// A grader decides which standards apply to a deliverable from each
// standard's `applies_to`, and which dimension a violation lands on from its
// `grades`. Both are only as good as three agreements JSON Schema cannot
// express on its own:
//
//   - The dimension ids the schema accepts are the ids
//     quality-rubric-dimensions.json publishes, in its order. The schema
//     carries a copy so a single file validates alone; this is what keeps the
//     copy honest.
//   - A rule's own `grades` narrows its standard's list and never adds to it,
//     so a reader who ignores the narrowing reaches a superset of the right
//     dimensions rather than a different set.
//   - Every kind the schema names is a file under standards/, and every file
//     is named in standards/README.md and docs/platform-reference.md, which
//     are where a person finds it.
//
// agent-access carries a roster a live probe reads, so its tokens are unique
// (robots.txt matches them case-insensitively) and every class the probe
// requests has at least one token to send.
//
// Usage: node scripts/check-standards-applicability.mjs [root]

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIND_PREFIX = "nanohype/standards/";
const RUBRIC = "quality-rubric-dimensions";

/**
 * Every problem with the standards corpus, as one message each.
 *
 * @param {object} input
 * @param {object} input.schema parsed schemas/standards.schema.json
 * @param {{ name: string, data: object }[]} input.standards each standards/<name>.json
 * @param {string} input.readme standards/README.md
 * @param {string} input.platformReference docs/platform-reference.md
 * @returns {string[]}
 */
export function checkStandards({ schema, standards, readme, platformReference }) {
  const errors = [];
  const byName = new Map(standards.map((s) => [s.name, s.data]));

  const schemaDimensions = schema.$defs?.dimension?.enum ?? [];
  const rubric = byName.get(RUBRIC);
  const published = (rubric?.content?.dimensions ?? []).map((d) => d.id);
  if (!rubric) {
    errors.push(`standards/${RUBRIC}.json is missing, so no dimension id can be checked.`);
  } else if (schemaDimensions.join("|") !== published.join("|")) {
    errors.push(
      `schemas/standards.schema.json $defs.dimension lists [${schemaDimensions.join(", ")}], ` +
        `but ${RUBRIC}.json publishes [${published.join(", ")}]. The schema's copy follows the standard.`,
    );
  }
  const dimensions = new Set(published);

  const kinds = schema.properties?.kind?.enum ?? [];
  for (const kind of kinds) {
    const name = kind.slice(KIND_PREFIX.length);
    if (!kind.startsWith(KIND_PREFIX) || !byName.has(name)) {
      errors.push(`the schema names kind ${kind}, and standards/${name}.json does not exist.`);
    }
  }

  for (const { name, data } of standards) {
    const where = `standards/${name}.json`;

    if (data.kind !== `${KIND_PREFIX}${name}`) {
      errors.push(
        `${where} declares kind ${data.kind}; its file name makes it ${KIND_PREFIX}${name}.`,
      );
    }
    if (!kinds.includes(data.kind)) {
      errors.push(
        `${where} declares kind ${data.kind}, which the schema's kind enum does not name.`,
      );
    }

    if (typeof data.applies_to !== "string" || data.applies_to.trim() === "") {
      errors.push(`${where} declares no applies_to, so a grader cannot tell where it applies.`);
    }

    if (!Array.isArray(data.grades)) {
      errors.push(`${where} declares no grades, so a violation has no dimension to land on.`);
    } else {
      for (const g of data.grades) {
        if (!dimensions.has(g)) {
          errors.push(`${where} grades "${g}", which ${RUBRIC}.json does not publish.`);
        }
      }
      if (name === RUBRIC && data.grades.length > 0) {
        errors.push(
          `${where} defines the dimensions rather than being graded on one; its grades is [].`,
        );
      }
      if (name !== RUBRIC && data.grades.length === 0) {
        errors.push(`${where} grades no dimension, so a violation of it is graded nowhere.`);
      }
      const own = new Set(data.grades);
      for (const { path, rule } of rulesIn(data.content)) {
        for (const g of rule.grades ?? []) {
          if (!own.has(g)) {
            errors.push(
              `${where} ${path} (${rule.id}) grades "${g}", which the standard's grades ` +
                `[${data.grades.join(", ")}] does not list. A rule narrows its standard's grades.`,
            );
          }
        }
      }
    }

    if (!readme.includes(`\`${name}.json\``)) {
      errors.push(`standards/README.md does not name \`${name}.json\`.`);
    }
    if (!platformReference.includes(`standards/${name}.json`)) {
      errors.push(`docs/platform-reference.md does not link standards/${name}.json.`);
    }
  }

  const access = byName.get("agent-access");
  if (access) errors.push(...checkAgentAccess(access.content ?? {}));

  return errors;
}

/** Every rule or requirement object under `content`, with the path it sits at. */
export function rulesIn(content, path = "content") {
  const found = [];
  if (Array.isArray(content)) {
    for (const [i, item] of content.entries()) found.push(...rulesIn(item, `${path}[${i}]`));
    return found;
  }
  if (content === null || typeof content !== "object") return found;
  for (const [key, value] of Object.entries(content)) {
    if ((key === "rules" || key === "requirements") && Array.isArray(value)) {
      for (const [i, rule] of value.entries()) {
        if (rule && typeof rule === "object") found.push({ path: `${path}.${key}[${i}]`, rule });
      }
    } else {
      found.push(...rulesIn(value, `${path}.${key}`));
    }
  }
  return found;
}

/** The roster invariants a live probe relies on. */
export function checkAgentAccess(content) {
  const errors = [];
  const fetchers = content.agent_fetchers ?? [];
  const seen = new Map();
  for (const f of fetchers) {
    const key = String(f.token).toLowerCase();
    if (seen.has(key)) {
      errors.push(
        `agent-access lists token ${f.token} twice (also as ${seen.get(key)}); ` +
          "robots.txt matches tokens case-insensitively, so the two entries name one agent.",
      );
    }
    seen.set(key, f.token);
  }
  for (const cls of content.probe?.classes ?? []) {
    if (!fetchers.some((f) => f.class === cls)) {
      errors.push(`agent-access probes class ${cls}, and no fetcher in agent_fetchers has it.`);
    }
  }
  return errors;
}

/** Read the corpus from a repository root. */
export function readCorpus(root) {
  const dir = join(root, "standards");
  const standards = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({
      name: f.replace(/\.json$/, ""),
      data: JSON.parse(readFileSync(join(dir, f), "utf-8")),
    }));
  return {
    schema: JSON.parse(readFileSync(join(root, "schemas/standards.schema.json"), "utf-8")),
    standards,
    readme: readFileSync(join(dir, "README.md"), "utf-8"),
    platformReference: readFileSync(join(root, "docs/platform-reference.md"), "utf-8"),
  };
}

// Importing this module for its checks must not run the gate.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = resolve(process.argv[2] ?? ".");
  const corpus = readCorpus(root);
  if (corpus.standards.length === 0) {
    console.error(
      "check-standards-applicability: standards/ holds no .json file, so this gate is asserting nothing.",
    );
    process.exit(2);
  }
  const errors = checkStandards(corpus);
  if (errors.length > 0) {
    console.error("standards applicability check FAILED:\n");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `standards applicability check passed: ${corpus.standards.length} standard(s), ` +
      "each with applies_to and grades drawn from quality-rubric-dimensions.",
  );
}
