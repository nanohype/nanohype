#!/usr/bin/env node
/**
 * Every `npm run <script>` a contributor-facing document tells someone to run
 * must exist in the package.json that would actually be in scope when they run
 * it.
 *
 * CONTRIBUTING.md told contributors to run `npm run format:check`, described
 * as prettier. There is no `format:check` script in this repository and there
 * is no prettier — `lint` and `format` are both Biome. Two errors on one line,
 * in the file whose entire job is telling a first-time contributor what to
 * type, in a public repo.
 *
 * It survived because nothing reads prose. The scripts themselves are exercised
 * constantly; the sentence naming them is exercised by nobody until a human
 * follows it and it does not work.
 *
 * Scope follows `cd`. A fenced block that opens with `cd sdk` is describing the
 * SDK's manifest for the rest of that block, so its commands are resolved
 * there — checked against the right package rather than skipped, because
 * `npm run buidl` inside an sdk block is the same defect.
 *
 *   node scripts/check-doc-commands.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Docs that instruct a human to run something in this repository. */
const DOCS = ["CONTRIBUTING.md", "README.md", "CLAUDE.md", "AGENTS.md"];

/**
 * `npm run <script>` in prose or a fenced block. Trailing `--`, arguments and
 * comments are dropped; only the script name is checked, because that is the
 * part package.json has to define.
 */
const NPM_RUN = /\bnpm run ([a-z0-9][a-z0-9:_-]*)/g;
const FENCE = /^\s*```/;
const CD = /^\s*cd\s+([^\s&|;]+)/;

const scriptCache = new Map();

/** The script names declared by the package.json at `dir`, or null if none. */
function scriptsFor(dir) {
  if (scriptCache.has(dir)) return scriptCache.get(dir);
  let names = null;
  try {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, dir, "package.json"), "utf8"));
    names = new Set(Object.keys(manifest.scripts ?? {}));
  } catch {
    names = null; // no manifest there — reported, not silently passed
  }
  scriptCache.set(dir, names);
  return names;
}

if (!scriptsFor(".")) {
  console.error("check-doc-commands: no package.json at the repository root");
  process.exit(1);
}

const problems = [];
let referenced = 0;

for (const doc of DOCS) {
  let text;
  try {
    text = readFileSync(resolve(ROOT, doc), "utf8");
  } catch {
    continue; // an optional document is not a failure
  }

  let inFence = false;
  let cwd = ".";

  for (const [index, line] of text.split("\n").entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      // Scope is per block: a `cd` inside one block says nothing about the next.
      cwd = ".";
      continue;
    }

    const cd = inFence && line.match(CD);
    if (cd) {
      cwd = cd[1];
      continue;
    }

    for (const match of line.matchAll(NPM_RUN)) {
      referenced += 1;
      const names = scriptsFor(cwd);
      const where = `${doc}:${index + 1}`;
      if (!names) {
        problems.push(
          `${where} runs \`npm run ${match[1]}\` in ${cwd}/, which has no package.json`,
        );
      } else if (!names.has(match[1])) {
        const at = cwd === "." ? "package.json" : `${cwd}/package.json`;
        problems.push(`${where} says \`npm run ${match[1]}\`, which ${at} does not define`);
      }
    }
  }
}

// Without this, a pattern that stopped matching would report every document
// clean by finding nothing to check.
if (referenced === 0) {
  console.error("check-doc-commands: matched no `npm run` in any document — the pattern is broken");
  process.exit(1);
}

if (problems.length) {
  console.error("check-doc-commands: documented commands that do not exist:\n");
  for (const line of problems) console.error(`  ✗ ${line}`);
  console.error("\nAdd the script, or fix the document to name one that exists.");
  process.exit(1);
}

console.log(`check-doc-commands: ${referenced} documented command(s) all resolve`);
