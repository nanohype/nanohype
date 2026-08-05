#!/usr/bin/env node
/**
 * Every "uncomment the `X` … in `Y`" instruction a template gives its author
 * must name a file that exists and a block that is actually in it, commented.
 *
 * The catalog is the factory's vocabulary. An instruction here is not a note to
 * a reader — it is the step an agent scaffolding from this template will carry
 * out, and a step that cannot be carried out produces a skeleton that is missing
 * the thing the README says it has.
 *
 * The agent-fleet skeleton told its author to uncomment the
 * `spec.compute.acceleratorClaim` block in `agentfleet.yaml`. That block was not
 * in `agentfleet.yaml` and never had been. The instruction was wrong on the day
 * it was written, and later grew two more falsehoods when the CR kind it named
 * and the landing-zone component it credited were both deleted — at which point
 * the catalog was teaching three things that did not exist, with
 * validate-templates and Template Doctor both green.
 *
 * They were green correctly: they check catalog health and skeleton structure.
 * Nothing checked whether a sentence in a README described the file next to it.
 *
 * SCOPE. Only instructions that name their target file. "Uncomment and set the
 * `name` to the guardrail resource's name" points at no file and is left alone —
 * this check reads the ones that can be resolved, and says how many it resolved
 * so that "matched nothing" cannot masquerade as "all correct".
 *
 *   node scripts/check-uncomment-instructions.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "templates");

/**
 * `uncomment the \`X\` <noun> in \`Y\``, case-insensitive, with any run of
 * whitespace between the parts.
 *
 * Matched against the document with newlines collapsed, because these
 * instructions wrap: the one that prompted this check spanned two lines, and a
 * line-oriented scan would have missed it — which is the failure mode of a
 * checker that only ever sees the well-formatted case.
 *
 * The noun between the two backticked spans is optional and unconstrained
 * ("section", "block", "binding", ""), since it carries no meaning for the
 * assertion and constraining it would silently drop instructions.
 */
const INSTRUCTION = /uncomment\s+(?:the\s+)?`([^`]+)`\s*(?:[a-z]+\s+)?in\s+`([^`]+)`/gi;

/** Collapse newlines so a wrapped instruction reads as one string. */
const flatten = (text) => text.replace(/\s+/g, " ");

function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

/**
 * Is `needle` present in `haystack` on a line that is commented out?
 *
 * Deliberately loose about the comment marker — `#`, `//`, `<!--` and YAML/TOML
 * all appear across this catalog — and deliberately strict that the line must be
 * commented. An instruction to uncomment something that is already live is as
 * wrong as one naming something absent, and reads exactly the same to an author.
 */
function commentedOut(haystack, needle) {
  for (const line of haystack.split("\n")) {
    if (!line.includes(needle)) continue;
    if (/^\s*(#|\/\/|<!--|;)/.test(line)) return true;
  }
  return false;
}

const problems = [];
let checked = 0;

for (const doc of markdownFiles(TEMPLATES)) {
  const flat = flatten(readFileSync(doc, "utf8"));
  const here = dirname(doc);
  const rel = doc.slice(ROOT.length + 1);

  for (const [, block, file] of flat.matchAll(INSTRUCTION)) {
    checked += 1;
    const target = join(here, file);

    if (!existsSync(target)) {
      problems.push(
        `${rel}\n    tells the author to uncomment \`${block}\` in \`${file}\`, ` +
          `which does not exist next to this document.`,
      );
      continue;
    }

    const body = readFileSync(target, "utf8");
    if (!body.includes(block)) {
      problems.push(
        `${rel}\n    tells the author to uncomment \`${block}\` in \`${file}\`, ` +
          `which contains no such text.`,
      );
      continue;
    }
    if (!commentedOut(body, block)) {
      problems.push(
        `${rel}\n    tells the author to uncomment \`${block}\` in \`${file}\`, ` +
          `where it is present but not commented out — there is nothing to uncomment.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`\nThe catalog gives ${problems.length} instruction(s) an author cannot follow.\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    [
      "",
      "A template's README is a step an agent scaffolding from it will carry out, not",
      "a note to a reader. An instruction naming a block that is absent produces a",
      "skeleton missing the thing the README says it has.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// Zero is not a pass. If INSTRUCTION stops matching the way these READMEs are
// written, every instruction goes unchecked and the output is indistinguishable
// from a catalog with none wrong.
if (checked === 0) {
  console.error(
    "\nNo resolvable uncomment instruction was found anywhere in templates/.\n" +
      "That is not a pass — it means INSTRUCTION no longer matches how these\n" +
      "READMEs are written, so this check is asserting nothing.\n",
  );
  process.exit(1);
}

console.log(`uncomment instructions ok — ${checked} resolved against the file each names.`);
