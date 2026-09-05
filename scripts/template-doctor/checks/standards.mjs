#!/usr/bin/env node
/**
 * Assert every skeleton's test configuration against the standards this repo
 * publishes.
 *
 * The catalog is the vocabulary the factory scaffolds from, so a skeleton that
 * ships below the published bar hands every consumer a project that starts in
 * violation of a rule this repository owns. That had happened quietly and at
 * scale: forty-three TypeScript skeletons declared coverage thresholds that
 * `vitest run` never evaluated, nineteen of those numbers sat under the
 * published floor, and the Python skeleton shipped no coverage configuration at
 * all. None of it was detectable by reading a config, because a threshold that
 * is present and a threshold that binds look identical.
 *
 * So this checks both directions, the same way the fix did:
 *
 *   - A skeleton below the floor must be DECLARED below it, with a reason.
 *     Silence is the failure mode being prevented — a number nobody chose reads
 *     exactly like a number someone did.
 *   - A declaration that no longer matches its config is also an error. An
 *     exception whose skeleton has since been raised is a stale apology, and one
 *     whose value has drifted describes a config that no longer exists.
 *
 * Emits TSV on stdout: severity, category, template, message. standards.sh
 * turns each line into a `finding`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TEMPLATES = join(ROOT, "templates");

/** The published floor. Read, never hardcoded — this file must not become a second source. */
const FLOOR = JSON.parse(readFileSync(join(ROOT, "standards", "testing-rubric.json"), "utf-8"))
  .content.coverage_floor;

/**
 * Skeletons whose suites do not yet reach the floor, pinned at what they
 * actually measure so a regression still fails, with what it would take to
 * close the distance. Raising a number here without writing the tests puts the
 * gate back to decorative, which is the exact failure this check exists to
 * prevent.
 *
 * The check below reports a stale entry as an error precisely so this does not
 * become a permanent allowlist — an exception that outlives its reason reads as
 * a standard with a carve-out rather than a standard. An entry leaves when its
 * skeleton reaches the floor, which is the only way it should leave: raising a
 * number here without writing the tests puts the gate back to decorative.
 *
 * Empty is the state this is aimed at, not a sign the check has nothing to do —
 * a skeleton dropping under the floor is reported against no entry at all.
 */
const BELOW_FLOOR = {};

/**
 * Go skeletons gate through a Makefile COVERAGE_MIN, pinned the same way.
 *
 * go-cli and module-auth-go now clear the published floor and are gone from
 * here. What remains cannot be closed by writing more unit tests.
 */
const GO_BELOW_FLOOR = {
  "go-service": {
    min: 67,
    why: "the PostgreSQL repository's CRUD needs a live server; it is not excluded from the profile, so it counts against the number rather than being hidden from it",
  },
};

/**
 * The text inside `thresholds: { ... }`, found by balancing braces.
 *
 * A non-greedy match to the first line ending in a brace stops at the first
 * nested object instead, and a per-file override written across several lines
 * is one — so the block would end before the metrics that follow it.
 */
function thresholdsBlock(source) {
  const start = source.search(/\bthresholds:\s*\{/);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * The same text with every nested object removed.
 *
 * `coverage.thresholds` holds the global floor and, beside it, per-file
 * overrides keyed by path. Both spell the same four metric names, so a scan
 * over the whole block reads whichever came last — an override of 100 on one
 * file reported as the threshold for the skeleton. The global floor is what
 * this check is about; an override is a different claim about a different
 * surface.
 */
function withoutNestedObjects(block) {
  let out = "";
  let depth = 0;
  for (const ch of block) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) out += ch;
  }
  return out;
}

const findings = [];
const report = (severity, category, template, message) =>
  findings.push([severity, category, template, message].join("\t"));

/** Every file matching name under dir, skipping node_modules. */
function findFiles(dir, name, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findFiles(full, name, acc);
    else if (entry === name) acc.push(full);
  }
  return acc;
}

const templates = readdirSync(TEMPLATES).filter((t) =>
  existsSync(join(TEMPLATES, t, "template.yaml")),
);

// --- TypeScript ---------------------------------------------------------------

// Enumerated from package.json, not from the config file. The Go half below
// starts at go.mod and the Python half at pyproject.toml — each begins at the
// marker that says "this is a project of that language", so each can report a
// project that gates nothing. This half began at `vitest.config.ts` and then
// looped over what it found, so a skeleton with no config produced an empty
// loop and no finding. testing-rubric.json's `enforce-floor-in-config` is
// severity `reject` and names that exact case: "A project that ships no
// thresholds at all is the anti-pattern this prevents." The detector for it
// could not express it.
//
// The extension list is not decoration. `vitest.config.mts` holds the same
// config and was invisible to an exact-filename match, and jest keeps its
// thresholds in package.json under `coverageThreshold` — the rubric names both
// runners.
const TS_CONFIG = /^(?:vitest|jest)\.config\.(?:ts|mts|cts|js|mjs|cjs)$/;

/** Every file under dir whose basename matches a pattern, skipping node_modules. */
function findMatching(dir, pattern, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findMatching(full, pattern, acc);
    else if (pattern.test(entry)) acc.push(full);
  }
  return acc;
}

let jsSkeletons = 0;
let jsGated = 0;
let jsExempt = 0;
let jsUngated = 0;

for (const template of templates) {
  const skeleton = join(TEMPLATES, template, "skeleton");
  const manifests = findFiles(skeleton, "package.json");
  if (manifests.length === 0) continue;
  jsSkeletons++;

  const configs = findMatching(skeleton, TS_CONFIG);

  // A manifest with no `test` script is not gating anything to begin with —
  // an end-to-end harness driven by `test:e2e`, for instance. Exempt, but
  // counted, so the exemption is a number in the output rather than a
  // skeleton that silently never appeared.
  const runsTests = manifests.some((m) => {
    try {
      return Boolean(JSON.parse(readFileSync(m, "utf-8")).scripts?.test);
    } catch {
      return false;
    }
  });

  if (!runsTests) {
    jsExempt++;
    continue;
  }

  if (configs.length === 0) {
    const jest = manifests.find((m) => /"coverageThreshold"/.test(readFileSync(m, "utf-8")));
    if (!jest) {
      jsUngated++;
      report(
        "error",
        "coverage-config",
        template,
        `declares a \`test\` script and ships no vitest or jest config anywhere under skeleton/, so no coverage floor is encoded; a project that ships no thresholds at all is the anti-pattern testing-rubric.json names at severity reject`,
      );
      continue;
    }
  }

  jsGated++;

  for (const config of configs) {
    const where = relative(ROOT, config);
    const source = readFileSync(config, "utf-8");

    const coverage = source.match(/coverage:\s*\{/);
    if (!coverage) {
      report(
        "error",
        "coverage-config",
        template,
        `${where} declares no coverage block; standards/testing-rubric.json requires a floor encoded in the runner config`,
      );
      continue;
    }

    // The distinction that made this whole class of bug invisible: a threshold
    // vitest never evaluates is indistinguishable from one it enforces.
    if (!/coverage:\s*\{[^}]*?\benabled:\s*true/s.test(source)) {
      report(
        "error",
        "coverage-inert",
        template,
        `${where} declares thresholds but not coverage.enabled, so \`vitest run\` collects nothing and the floor never binds`,
      );
    }

    const block = thresholdsBlock(source);
    if (block === null) {
      report("error", "coverage-config", template, `${where} declares no thresholds`);
      continue;
    }

    const declared = {};
    for (const [, key, value] of withoutNestedObjects(block).matchAll(
      /\b(lines|functions|statements|branches):\s*(\d+)/g,
    )) {
      declared[key] = Number(value);
    }

    const exception = BELOW_FLOOR[template];
    for (const metric of Object.keys(FLOOR)) {
      if (!(metric in declared)) {
        report(
          "error",
          "coverage-config",
          template,
          `${where} sets no ${metric} threshold; the published floor names all four`,
        );
        continue;
      }
      const value = declared[metric];
      const allowed = exception?.[metric];

      if (value >= FLOOR[metric]) {
        if (allowed !== undefined) {
          report(
            "error",
            "stale-exception",
            template,
            `${metric} is ${value}, at or above the floor of ${FLOOR[metric]}, but BELOW_FLOOR still records ${allowed} — drop the entry`,
          );
        }
        continue;
      }
      if (allowed === undefined) {
        report(
          "error",
          "below-floor",
          template,
          `${where} sets ${metric} to ${value}, under the published floor of ${FLOOR[metric]}, and is not declared in BELOW_FLOOR — raise it or record why it cannot be raised`,
        );
      } else if (allowed !== value) {
        report(
          "error",
          "stale-exception",
          template,
          `${metric} is ${value} but BELOW_FLOOR records ${allowed}; the config moved and the record did not`,
        );
      }
    }
  }
}

for (const template of Object.keys(BELOW_FLOOR)) {
  if (!templates.includes(template)) {
    report(
      "error",
      "stale-exception",
      template,
      `BELOW_FLOOR names a template that no longer exists — drop the entry`,
    );
  }
}

// --- Python -------------------------------------------------------------------

for (const template of templates) {
  const pyproject = join(TEMPLATES, template, "skeleton", "pyproject.toml");
  if (!existsSync(pyproject)) continue;
  const where = relative(ROOT, pyproject);
  const source = readFileSync(pyproject, "utf-8");

  const failUnder = source.match(/--cov-fail-under=(\d+)/);
  if (!failUnder) {
    report(
      "error",
      "coverage-config",
      template,
      `${where} runs pytest with no --cov-fail-under; a project that ships no thresholds at all is the anti-pattern testing-rubric.json names`,
    );
  } else if (Number(failUnder[1]) < FLOOR.lines) {
    report(
      "error",
      "below-floor",
      template,
      `${where} sets --cov-fail-under=${failUnder[1]}, under the published floor of ${FLOOR.lines}`,
    );
  }

  // language-toolchain.json names `mypy src` as the Python typecheck step and
  // `ruff check . && ruff format --check .` as lint. black is a second
  // formatter over the same files.
  if (!/\[tool\.mypy\]/.test(source)) {
    report(
      "error",
      "toolchain",
      template,
      `${where} configures no mypy; language-toolchain.json names \`mypy src\` as the Python typecheck`,
    );
  }
  if (/\[tool\.black\]/.test(source)) {
    report(
      "error",
      "toolchain",
      template,
      `${where} configures black alongside ruff; language-toolchain.json's lint step is \`ruff check . && ruff format --check .\``,
    );
  }
}

// --- Go -----------------------------------------------------------------------

for (const template of templates) {
  const makefile = join(TEMPLATES, template, "skeleton", "Makefile");
  if (!existsSync(join(TEMPLATES, template, "skeleton", "go.mod"))) continue;
  if (!existsSync(makefile)) {
    report("error", "coverage-config", template, `a Go skeleton with no Makefile to gate coverage`);
    continue;
  }
  const where = relative(ROOT, makefile);
  const source = readFileSync(makefile, "utf-8");
  const min = source.match(/^COVERAGE_MIN\s*:?=\s*(\d+)/m);

  if (!min) {
    report(
      "error",
      "coverage-config",
      template,
      `${where} defines no COVERAGE_MIN, so \`make test\` enforces no floor`,
    );
    continue;
  }
  const value = Number(min[1]);
  const exception = GO_BELOW_FLOOR[template];
  if (value >= FLOOR.lines) {
    if (exception) {
      report(
        "error",
        "stale-exception",
        template,
        `COVERAGE_MIN is ${value}, at or above the floor, but GO_BELOW_FLOOR still records ${exception.min} — drop the entry`,
      );
    }
  } else if (!exception) {
    report(
      "error",
      "below-floor",
      template,
      `${where} sets COVERAGE_MIN=${value}, under the published floor of ${FLOOR.lines}, and is not declared in GO_BELOW_FLOOR`,
    );
  } else if (exception.min !== value) {
    report(
      "error",
      "stale-exception",
      template,
      `COVERAGE_MIN is ${value} but GO_BELOW_FLOOR records ${exception.min}; the Makefile moved and the record did not`,
    );
  }
}

for (const template of Object.keys(GO_BELOW_FLOOR)) {
  if (!templates.includes(template)) {
    report(
      "error",
      "stale-exception",
      template,
      `GO_BELOW_FLOOR names a template that no longer exists — drop the entry`,
    );
  }
}

// The corpus this run actually examined, on stderr so the TSV contract with
// standards.sh is unchanged. A gate that reports clean without saying what it
// looked at cannot be told apart from one that looked at nothing.
process.stderr.write(
  `standards: ${jsSkeletons} JS/TS skeleton(s) — ${jsGated} gated, ${jsExempt} with no \`test\` script, ` +
    `${jsUngated} declaring tests with no runner config\n`,
);

// Every skeleton leaves the loop through exactly one of the three counters.
// A gap means a path out of the loop that emits nothing and is counted as
// nothing, which is the shape this whole check was rewritten to remove.
if (jsGated + jsExempt + jsUngated !== jsSkeletons) {
  process.stderr.write(
    `standards: ${jsSkeletons} skeleton(s) went in and ${jsGated + jsExempt + jsUngated} came out accounted for\n`,
  );
  process.exit(2);
}

if (jsSkeletons === 0) {
  process.stderr.write(
    "standards: found no package.json under templates/ — the scan is broken, not the catalog\n",
  );
  process.exit(2);
}

process.stdout.write(findings.length ? `${findings.join("\n")}\n` : "");
