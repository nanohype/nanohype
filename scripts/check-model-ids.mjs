#!/usr/bin/env node
//
// check-model-ids.mjs — fail if a Claude model ID in the catalog is not one the
// LLM policy names, or is written in a form Bedrock refuses.
//
// Two separate failure modes, both of which shipped:
//
//   1. Retired and never-existent IDs. A scaffold born on
//      claude-sonnet-4-20250514 (retired) or claude-haiku-4-20250514 (never
//      existed) 404s on its first call. Nothing caught it because a model ID is
//      just a string — no compiler, linter or type checker has an opinion.
//
//   2. Bare Bedrock foundation-model IDs in invoke position. The whole current
//      Claude family reports inferenceTypesSupported: [INFERENCE_PROFILE], so
//      anthropic.claude-sonnet-5 is refused with a ValidationException while
//      us.anthropic.claude-sonnet-5 works. The policy said so in prose while
//      every skeleton default contradicted it.
//
// The allowed set is derived from standards/llm-policy.json rather than listed
// here, so moving the catalog to a new model is one edit to the standard and
// this gate follows. Same reason check-slo-constants.mjs reads its numbers from
// the standard instead of transcribing them.
//
// Usage: node scripts/check-model-ids.mjs [root]

import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const STANDARD = resolve(root, "standards/llm-policy.json");

const declared = Object.values(JSON.parse(readFileSync(STANDARD, "utf-8")).content.models);

const GEOS = ["us", "eu", "jp", "ap", "apac", "global"];
const GEO = new RegExp(`^(?:${GEOS.join("|")})\\.`);
// Bedrock carries a release date and API version on some IDs and not others —
// claude-haiku-4-5-20251001-v1:0 against a dateless claude-sonnet-5 — and the
// direct Anthropic API never carries either. Strip them to get the one model
// name both delivery paths share, so a single declaration covers both.
const BEDROCK_SUFFIX = /(?:-\d{8})?(?:-v\d+(?::\d+)?)?$/;

/** The model name the direct Anthropic API uses, from any spelling of the ID. */
const directName = (id) =>
  id
    .replace(GEO, "")
    .replace(/^anthropic\./, "")
    .replace(BEDROCK_SUFFIX, "");

const bareNames = new Set(declared.map(directName));
if (bareNames.size !== declared.length) {
  console.error(`check-model-ids: ${STANDARD} declares the same model twice.`);
  process.exit(1);
}

// Model IDs the catalog may use, in any of the three forms a caller needs:
// the direct-API name, the Bedrock foundation-model ID, and the inference
// profile. The foundation-model form is allowed in a pricing key or an IAM
// resource — the invoke-position rule below is what rejects it as a default.
// Bedrock's own form for a model may carry the release date and API version the
// direct-API name omits, and both spellings appear legitimately (a pricing key
// keyed on the foundation-model ID, an inference profile that keeps the date).
// Accept the declared IDs verbatim alongside every derived spelling.
const allowed = new Set(declared);
for (const name of bareNames) {
  const bedrock = declared.find((id) => directName(id) === name).replace(GEO, "");
  for (const form of new Set([name, bedrock, `anthropic.${name}`])) {
    allowed.add(form);
    if (form.startsWith("anthropic.")) {
      for (const geo of GEOS) allowed.add(`${geo}.${form}`);
    }
  }
}

// What counts as a Claude model ID. Anchored on a family word so prose ("Claude
// is the primary LLM"), package names (claude-agent-sdk, claude-cli) and
// arbitrary label strings in fixtures are not swept in. A trailing -vN:M or
// date is part of the ID.
const MODEL_ID =
  /\b(?:(?:us|eu|jp|ap|apac|global)\.)?(?:anthropic\.)?claude-(?:opus|sonnet|haiku)-[0-9][A-Za-z0-9.:-]*/g;

// Invoke position: a bare foundation-model ID assigned as a model default or
// passed as a model argument. Matching the assignment rather than the file lets
// a pricing table keep the bare form, which is the correct key there.
const INVOKE_CONTEXT = /(?:model|modelId|LLM_MODEL|DEFAULT_MODEL|ModelId)\s*[:=]|\.default\(|\?\?/i;

// `dist/` is gitignored build output inside skeletons that have been compiled
// locally — it holds a stale copy of source this gate already reads, so a hit
// there is a duplicate of a hit it will report anyway, or a false one for code
// that no longer exists. This script is skipped because naming the bad IDs is
// its job.
const SKIP =
  /(?:^|[/\\])(?:node_modules|dist|\.git|\.turbo)[/\\]|scripts[/\\]check-model-ids\.mjs$/;
// The dotfile pattern is separate because `*` does not match a leading dot, and
// `.env.example` is exactly where a scaffold's model ID is configured — the most
// important file to scan was the one a single glob silently skipped.
const files = [
  ...globSync("**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,json,yaml,yml,md,example}", { cwd: root }),
  ...globSync("**/.env*", { cwd: root }),
].filter((p) => !SKIP.test(p));

const unknown = [];
const bareInvoke = [];

for (const rel of files) {
  const path = resolve(root, rel);
  let text;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    continue; // a directory matched the glob
  }
  if (!text.includes("claude-")) continue;

  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const id of line.match(MODEL_ID) ?? []) {
      const where = `${relative(root, path)}:${i + 1}`;
      if (!allowed.has(id)) {
        unknown.push(`${where}  ${id}`);
        continue;
      }
      // Allowed, but is it the refused form in a position that invokes?
      if (/^anthropic\./.test(id) && INVOKE_CONTEXT.test(line)) {
        bareInvoke.push(`${where}  ${id}`);
      }
    }
  }
}

let failed = false;

if (unknown.length) {
  failed = true;
  console.error(
    `check-model-ids: ${unknown.length} Claude model ID(s) the LLM policy does not name.\n` +
      `Allowed model names: ${[...bareNames].sort().join(", ")}\n` +
      `Either use one of those, or move the catalog forward by editing\n` +
      `standards/llm-policy.json — this gate reads its allowed set from there.\n`,
  );
  for (const u of unknown) console.error(`  ${u}`);
}

if (bareInvoke.length) {
  failed = true;
  console.error(
    `\ncheck-model-ids: ${bareInvoke.length} bare Bedrock foundation-model ID(s) in invoke position.\n` +
      `The current Claude family is INFERENCE_PROFILE-only, so these are refused with a\n` +
      `ValidationException on the first call. Prefix with the deploy region's geo —\n` +
      `us.anthropic.<model> — or, for the direct Anthropic API, drop the provider prefix.\n`,
  );
  for (const b of bareInvoke) console.error(`  ${b}`);
}

if (failed) process.exit(1);

console.log(
  `check-model-ids: every Claude model ID in the catalog is one the LLM policy names ` +
    `(${[...bareNames].sort().join(", ")}), and none is a bare foundation-model ID in ` +
    `invoke position.`,
);
