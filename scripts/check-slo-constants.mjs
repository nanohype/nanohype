#!/usr/bin/env node
//
// check-slo-constants.mjs — fail if the burn-rate factors and objective
// denominators inlined into the eks-gitops alert PromQL drift from
// standards/observability-slo.json.
//
// The standard lives in this repo; its consumers — the GrafanaAlertRuleGroup
// exprs — live in eks-gitops (inlined because prod has no Prometheus ruler).
// Neither repo's own CI could otherwise catch the standard changing out from
// under the alerts. CI sparse-checks-out the eks-gitops alerting dir and runs
// this so a change here is caught against the live consumers.
//
// Usage: node scripts/check-slo-constants.mjs <eks-gitops-alerting-dir>

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STANDARD = 'standards/observability-slo.json';
const alertDir = process.argv[2];
if (!alertDir) {
  console.error('usage: check-slo-constants.mjs <eks-gitops-alerting-dir>');
  process.exit(2);
}

const c = JSON.parse(readFileSync(STANDARD, 'utf-8')).content;

// Burn-rate factors from the standard. Page-tier are the ones the prod ruler
// actually implements; ticket-tier (3, 1) are defined but not alerted in prod.
const windows = c.burn_rate_alerts.windows;
const allFactors = new Set(windows.map((w) => w.factor));
const pageFactors = new Set(windows.filter((w) => w.severity === 'page').map((w) => w.factor));

// Objective denominators = 1 - objective, rounded to kill float dust (0.999 -> 0.001).
const round = (n) => Math.round(n * 1e6) / 1e6;
const denominators = new Set(c.slo.sli_types.map((t) => round(1 - t.default_objective)));

const files = readdirSync(alertDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
if (files.length === 0) {
  console.error(`no alert files under ${alertDir}`);
  process.exit(2);
}

const errors = [];
const usedFactors = new Set();

for (const f of files) {
  const text = readFileSync(join(alertDir, f), 'utf-8');
  // "> bool <factor>" is the multi-window/multi-burn-rate comparison.
  for (const m of text.matchAll(/> bool ([0-9]+(?:\.[0-9]+)?)/g)) {
    const factor = Number(m[1]);
    usedFactors.add(factor);
    if (!allFactors.has(factor)) {
      errors.push(
        `${f}: burn-rate factor ${factor} ("> bool ${m[1]}") is not a factor in ${STANDARD} (defined: ${[...allFactors].sort((a, b) => a - b).join(', ')})`,
      );
    }
  }
  // "/ 0.0xx" is the error ratio divided by (1 - objective) to get the burn rate.
  for (const m of text.matchAll(/\/ (0\.0[0-9]+)/g)) {
    const denom = round(Number(m[1]));
    if (!denominators.has(denom)) {
      errors.push(
        `${f}: objective denominator ${m[1]} is not (1 - objective) for any SLI in ${STANDARD} (defined: ${[...denominators].sort((a, b) => a - b).join(', ')})`,
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

if (errors.length) {
  console.error('SLO-constants drift detected:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    `\nThe alert PromQL inlines the burn-rate factors + objective denominators from ${STANDARD}.`,
  );
  console.error(
    'When the standard changes, update the eks-gitops alert exprs to match (or vice versa).',
  );
  process.exit(1);
}

console.log(
  `SLO-constants OK: alert factors {${[...usedFactors].sort((a, b) => a - b).join(', ')}} and objective denominators all match ${STANDARD}.`,
);
