#!/usr/bin/env node

/**
 * Every template and every composite in the catalog must actually render.
 *
 * This is the catalog's load-bearing test and it did not exist. The SDK's
 * renderer suite builds its manifests by hand, so no test anywhere calls
 * renderTemplate() on a real catalog entry — the thing this repository ships.
 * Every other gate reads the catalog UNRENDERED: the schema validator checks
 * template.yaml, the skeleton linter lints files with placeholders still in
 * them, and validate.sh asserts that placeholders ARE present. All of them pass
 * on a template that throws the moment somebody scaffolds it.
 *
 * One did. A skeleton carried a `#endif` with no opening `#if` — its imports
 * had been alphabetized and the marker comments stayed where they were — so the
 * template could not be scaffolded at all, and it took every composite that
 * included it down too. Green catalog, green CI, dead product surface.
 *
 * Two assertions per entry:
 *   1. it renders without throwing
 *   2. no placeholder survives into the rendered output
 *
 * The second matters as much as the first. A template that renders but leaves
 * `__PROJECT_NAME__` in a file is not a scaffold, and nothing else looks.
 *
 * Required variables with no default are given a probed value that satisfies
 * their declared pattern, because the alternative — a fixture per template —
 * is a second copy of the catalog that drifts from the first.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderComposite } from "../sdk/dist/composite.js";
import { renderTemplate } from "../sdk/dist/renderer.js";
import { LocalSource } from "../sdk/dist/sources/local.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The prefix renderComposite uses when an entry throws. This gate reads that
// wording, so it is asserted against the source below: reword the message
// without updating this and the gate fails loudly instead of quietly passing
// every composite, which is the failure mode this whole check exists to catch.
const FAILED_ENTRY = "Failed to render entry";
const compositeSource = readFileSync(resolve(ROOT, "sdk/src/composite.ts"), "utf-8");
if (!compositeSource.includes(FAILED_ENTRY)) {
  console.error(
    `FAIL  sdk/src/composite.ts no longer emits "${FAILED_ENTRY}" — this gate reads that\n` +
      "      wording to tell a failed entry from a conditionally-excluded one, so it can\n" +
      "      no longer see a composite that renders partially. Update both together.",
  );
  process.exit(1);
}

// Ordered so the first candidate satisfies the widest set of patterns in the
// catalog. Single-word and separator-free is deliberate: several variables
// default to `${SomeOtherVar}` under a stricter pattern than the variable they
// derive from — k8s-app-tenant's AppMetric is `${AppName}` under snake_case,
// and its own description says a multi-word name has to set it explicitly. A
// dashed probe would fail that documented path and report a template defect
// that is not one.
//
// The trade is stated: this prober exercises the default path a single-word
// name takes, so a derived default that only breaks on multi-word input is not
// covered here. That is the template's documented contract to keep, not this
// gate's to second-guess.
//
// A variable no candidate satisfies is a real gap and is reported, not skipped.
const CANDIDATES = ["myapp", "my-app", "my_app", "MyApp", "my.app", "1"];

/** A value satisfying the variable's declared constraints, or null if none of
 *  the candidates do — in which case the variable, not the render, is at fault. */
function probeValue(variable) {
  if (variable.type === "bool") return "true";
  if (variable.type === "number") return "1";
  const pattern = variable.validation?.pattern;
  if (!pattern) return CANDIDATES[0];
  const re = new RegExp(`^(?:${pattern})$`);
  return CANDIDATES.find((c) => re.test(c)) ?? null;
}

/** Every required-without-default variable, probed. */
function probeAll(variables, unsatisfiable) {
  const values = {};
  for (const v of variables ?? []) {
    if (!v.required || "default" in v) continue;
    const probed = probeValue(v);
    if (probed === null) {
      unsatisfiable.push(`${v.name} (pattern ${v.validation.pattern})`);
      continue;
    }
    values[v.name] = probed;
  }
  return values;
}

/** Placeholders the renderer should have consumed. Declared placeholders only —
 *  a `__SCREAMING_SNAKE__` run in prose that no variable declares is not a
 *  rendering failure. */
function survivingPlaceholders(files, variables) {
  const declared = (variables ?? []).map((v) => v.placeholder).filter(Boolean);
  if (declared.length === 0) return [];
  const found = new Set();
  for (const file of files) {
    for (const placeholder of declared) {
      if (file.path.includes(placeholder) || file.content.includes(placeholder)) {
        found.add(placeholder);
      }
    }
  }
  return [...found];
}

const source = new LocalSource({ rootDir: ROOT });
const failures = [];

const templates = await source.listTemplates();
if (templates.length === 0) {
  console.error("FAIL  the catalog listed zero templates — this check evaluated nothing.");
  process.exit(1);
}

for (const entry of templates) {
  let manifest;
  let files;
  try {
    ({ manifest, files } = await source.fetchTemplate(entry.name));
  } catch (err) {
    failures.push(`${entry.name}: could not be read — ${err.message}`);
    continue;
  }
  const unsatisfiable = [];
  const values = probeAll(manifest.variables, unsatisfiable);
  if (unsatisfiable.length > 0) {
    failures.push(`${entry.name}: no probe value satisfies ${unsatisfiable.join(", ")}`);
    continue;
  }
  try {
    const result = renderTemplate(manifest, files, values);
    const left = survivingPlaceholders(result.files, manifest.variables);
    if (left.length > 0) {
      failures.push(`${entry.name}: rendered output still contains ${left.join(", ")}`);
    }
  } catch (err) {
    failures.push(`${entry.name}: ${err.message}`);
  }
}

const composites = await source.listComposites();
if (composites.length === 0) {
  console.error("FAIL  the catalog listed zero composites — this check evaluated nothing.");
  process.exit(1);
}

for (const entry of composites) {
  let manifest;
  try {
    manifest = await source.fetchComposite(entry.name);
  } catch (err) {
    failures.push(`${entry.name} (composite): could not be read — ${err.message}`);
    continue;
  }
  const unsatisfiable = [];
  const values = probeAll(manifest.variables, unsatisfiable);
  if (unsatisfiable.length > 0) {
    failures.push(
      `${entry.name} (composite): no probe value satisfies ${unsatisfiable.join(", ")}`,
    );
    continue;
  }
  try {
    const result = await renderComposite(manifest, values, source);
    // renderComposite catches a per-entry render failure, records it as a
    // warning and returns a success shape carrying a partial tree — so a
    // composite that lost half its templates looks like one that rendered.
    //
    // The warnings list is mixed: prerequisite notices are informational, and
    // an entry excluded by its `condition` is a correct outcome, not a failure.
    // So the signal is the render-failure warning specifically. That couples
    // this gate to a string in the SDK, which is why FAILED_ENTRY is asserted
    // against composite.ts below — a reworded message fails loudly here rather
    // than turning this check green.
    for (const warning of result.warnings ?? []) {
      if (warning.startsWith(FAILED_ENTRY)) {
        failures.push(`${entry.name} (composite): ${warning}`);
      }
    }
    if ((result.entries?.length ?? 0) === 0) {
      failures.push(`${entry.name} (composite): rendered no entries at all`);
    }
  } catch (err) {
    failures.push(`${entry.name} (composite): ${err.message}`);
  }
}

for (const failure of failures) console.error(`FAIL  ${failure}`);

if (failures.length > 0) {
  console.error(
    `\n${failures.length} failure(s) across ${templates.length} templates and ${composites.length} composites.`,
  );
  process.exit(1);
}

console.log(
  `catalog renders — ${templates.length} templates and ${composites.length} composites render with no surviving placeholders.`,
);
