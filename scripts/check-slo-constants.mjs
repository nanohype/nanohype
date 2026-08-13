#!/usr/bin/env node
//
// check-slo-constants.mjs — fail if the burn-rate constants its consumers
// hard-code drift from standards/observability-slo.json.
//
// The standard lives in this repo; nothing that reads it does. Two consumers
// transcribe its numbers, for different reasons, and neither repo's own CI can
// see the standard change out from under it:
//
//   1. The eks-gitops GrafanaAlertRuleGroup exprs, which inline the factors and
//      the objective denominators because production runs no Prometheus ruler.
//   2. The eks-agent-platform operator's burnWindows table, which drives the SLO
//      reconciler — the loop that decides whether to hold a tenant's rollout. A
//      drift there does not merely misreport; it changes when the platform acts.
//
// CI sparse-checks-out both and runs this against them, so a change here is
// caught against every live consumer rather than discovered in production.
//
// Usage: node scripts/check-slo-constants.mjs <eks-gitops-alerting-dir> [operator-controller-dir]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STANDARD = "standards/observability-slo.json";
const alertDir = process.argv[2];
const operatorDir = process.argv[3];
if (!alertDir) {
  console.error(
    "usage: check-slo-constants.mjs <eks-gitops-alerting-dir> [operator-controller-dir]",
  );
  process.exit(2);
}

const c = JSON.parse(readFileSync(STANDARD, "utf-8")).content;

// Burn-rate factors from the standard. Page-tier are the ones the prod ruler
// actually implements; ticket-tier (3, 1) are defined but not alerted in prod.
const windows = c.burn_rate_alerts.windows;
const allFactors = new Set(windows.map((w) => w.factor));
const pageFactors = new Set(windows.filter((w) => w.severity === "page").map((w) => w.factor));

// The full (severity, long, short, factor) tuples, keyed for set comparison
// against the operator's Go table.
const windowKey = (w) => `${w.severity}|${w.long}|${w.short}|${w.factor}`;
const standardPairs = new Set(windows.map(windowKey));

// Objective denominators = 1 - objective, rounded to kill float dust (0.999 -> 0.001).
const round = (n) => Math.round(n * 1e6) / 1e6;
const denominators = new Set(c.slo.sli_types.map((t) => round(1 - t.default_objective)));

const files = readdirSync(alertDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
if (files.length === 0) {
  console.error(`no alert files under ${alertDir}`);
  process.exit(2);
}

const errors = [];
const usedFactors = new Set();

for (const f of files) {
  const text = readFileSync(join(alertDir, f), "utf-8");
  // A burn-rate comparison is the error ratio divided by (1 - objective), then
  // compared against the factor: "… / 0.001 > bool 14.4". The division is what
  // makes the number on the right a burn rate, so it is part of the pattern.
  //
  // Matching a bare "> bool <n>" cannot work. PromQL uses that operator for any
  // comparison, and both alert files gate on minimum traffic with
  // "sum(rate(…)) > bool 0.0167" — ~1 event/minute, so a ratio computed over a
  // nearly-idle series cannot page. Read as a burn-rate factor, 0.0167 is not
  // one, and the check fails on a file that is correct.
  for (const m of text.matchAll(/\/ (0\.[0-9]+) > bool ([0-9]+(?:\.[0-9]+)?)/g)) {
    const factor = Number(m[2]);
    usedFactors.add(factor);
    if (!allFactors.has(factor)) {
      errors.push(
        `${f}: burn-rate factor ${factor} ("/ ${m[1]} > bool ${m[2]}") is not a factor in ${STANDARD} (defined: ${[...allFactors].sort((a, b) => a - b).join(", ")})`,
      );
    }
  }
  // "/ 0.0xx" is the error ratio divided by (1 - objective) to get the burn rate.
  for (const m of text.matchAll(/\/ (0\.0[0-9]+)/g)) {
    const denom = round(Number(m[1]));
    if (!denominators.has(denom)) {
      errors.push(
        `${f}: objective denominator ${m[1]} is not (1 - objective) for any SLI in ${STANDARD} (defined: ${[...denominators].sort((a, b) => a - b).join(", ")})`,
      );
    }
  }
}

// Every page-tier factor must be implemented by at least one alert.
for (const pf of pageFactors) {
  if (!usedFactors.has(pf)) {
    errors.push(`page-tier burn-rate factor ${pf} from ${STANDARD} is not used in any alert expr`);
  }
}

// ── Consumer 2: the operator's burnWindows table ────────────────────────────
// The table is transcribed Go, not generated, because the operator cannot reach
// this repo at build time. Compared as a SET of complete tuples rather than as
// loose factors: a table that kept every factor but paired 14.4 with the 6h
// window would still pass a factor-only check while paging on a different
// condition than the standard describes.
let operatorChecked = false;
if (operatorDir) {
  const goFile = join(operatorDir, "slo_reconcile.go");
  if (!existsSync(goFile)) {
    errors.push(
      `operator source ${goFile} not found; the burn-rate table moved or the checkout path is wrong`,
    );
  } else {
    operatorChecked = true;
    const go = readFileSync(goFile, "utf-8");
    const table = go.match(/var burnWindows = \[\]burnWindow\{([\s\S]*?)\n\}/);
    if (!table) {
      errors.push(
        `could not find the burnWindows table in ${goFile}; the declaration shape changed`,
      );
    } else {
      const rowRE =
        /\{severity:\s*(severityCritical|severityWarning),\s*long:\s*"([^"]+)",\s*short:\s*"([^"]+)",\s*factor:\s*([0-9]+(?:\.[0-9]+)?)\}/g;
      const goPairs = new Set();
      for (const m of table[1].matchAll(rowRE)) {
        const severity = m[1] === "severityCritical" ? "page" : "ticket";
        goPairs.add(`${severity}|${m[2]}|${m[3]}|${Number(m[4])}`);
      }
      if (goPairs.size === 0) {
        errors.push(
          `parsed no rows out of the burnWindows table in ${goFile}; the row shape changed`,
        );
      }
      for (const key of standardPairs) {
        if (!goPairs.has(key)) {
          errors.push(
            `burn-rate window ${key} from ${STANDARD} is missing from the operator's burnWindows table`,
          );
        }
      }
      for (const key of goPairs) {
        if (!standardPairs.has(key)) {
          errors.push(
            `the operator's burnWindows table declares ${key}, which is not a window in ${STANDARD}`,
          );
        }
      }
    }
  }
}

if (errors.length) {
  console.error("SLO-constants drift detected:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    `\nThe alert PromQL inlines the burn-rate factors + objective denominators from ${STANDARD}.`,
  );
  console.error(
    "When the standard changes, update every consumer to match (or vice versa): the eks-gitops alert exprs, and the eks-agent-platform operator's burnWindows table.",
  );
  process.exit(1);
}

console.log(
  `SLO-constants OK: alert factors {${[...usedFactors].sort((a, b) => a - b).join(", ")}} and objective denominators all match ${STANDARD}.`,
);
console.log(
  operatorChecked
    ? `SLO-constants OK: the operator's burnWindows table matches all ${standardPairs.size} window pairs in ${STANDARD}.`
    : "SLO-constants: operator burnWindows table NOT checked (no operator dir passed).",
);
