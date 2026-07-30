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
 * Empty: every TypeScript skeleton now meets the published floor. The check
 * below reports a stale entry as an error precisely so this does not quietly
 * become a permanent allowlist — an exception that outlives its reason reads as
 * a standard with a carve-out rather than a standard.
 */
const BELOW_FLOOR = {};

/** Go skeletons gate through a Makefile COVERAGE_MIN, pinned the same way. */
const GO_BELOW_FLOOR = {
  "go-cli": { min: 34, why: "cobra command bodies carry the logic and are untested" },
  "go-service": { min: 12, why: "handlers, middleware and the repository layer have no tests" },
  "module-auth-go": { min: 56, why: "the provider implementations are partially covered" },
};

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

for (const template of templates) {
  const configs = findFiles(join(TEMPLATES, template, "skeleton"), "vitest.config.ts");
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

    const block = source.match(/thresholds:\s*\{(.*?)\n\s*\}/s);
    if (!block) {
      report("error", "coverage-config", template, `${where} declares no thresholds`);
      continue;
    }

    const declared = {};
    for (const [, key, value] of block[1].matchAll(
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

process.stdout.write(findings.length ? `${findings.join("\n")}\n` : "");
