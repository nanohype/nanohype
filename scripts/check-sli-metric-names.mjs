// A template's metrics must be queryable by the objective the platform offers.
//
// SLOPolicy builds its PromQL from `sli.metric` plus a suffix its `sli.type`
// implies — it never accepts a raw query. So the series a template emits either
// fit that shape or the tenant simply cannot have an objective, and the failure
// is silent: the query resolves to nothing, the policy reports NoData forever,
// and AgentSLOEvaluationStale pages on a metric that was never there.
//
// Two rules, both learned from templates that were one character away from
// working.
//
// 1. AN ERRORS COUNTER NEEDS ITS DENOMINATOR.
//    An availability SLI reads `<m>_errors_total` over `<m>_requests_total`.
//    ts-service emitted `http_errors_total` — its own comment called it "the
//    'errors' of RED" — beside `http_request_total`, singular. With
//    `sli.metric: http` the denominator series does not exist, so the ratio
//    evaluates empty. A template that publishes an errors counter must publish
//    the matching requests counter, spelled the way the query builder spells it.
//
// 2. A LATENCY HISTOGRAM IS IN SECONDS.
//    A latency SLI reads `<m>_request_duration_seconds_{bucket,count}` and
//    `thresholdSeconds` names a bucket boundary in seconds. A histogram called
//    `_request_duration_ms` answers none of those queries, and one renamed to
//    `_seconds` while still recording milliseconds is worse — every value off by
//    1000 with nothing to say so. So the name and the declared unit have to
//    agree, and both have to be base units.
//
// Scoped to `*_request_duration_*` deliberately. Other duration histograms in
// these templates measure things that are not a request and cannot carry a
// latency SLI by name; converting them is worth doing and is not this gate's
// business.
//
// Usage: node scripts/check-sli-metric-names.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES = "templates";

const COUNTER = /createCounter\(\s*["']([a-z0-9_]+)["']/g;
const HISTOGRAM = /createHistogram\(\s*["']([a-z0-9_]+)["']/g;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const files = walk(TEMPLATES);
if (files.length === 0) {
  console.error(`no TypeScript sources under ${TEMPLATES}/ — the walk matched nothing,`);
  console.error("so this check is asserting nothing.");
  process.exit(2);
}

const errors = [];
let counters = 0;
let histograms = 0;

for (const f of files) {
  const src = readFileSync(f, "utf-8");

  const names = [...src.matchAll(COUNTER)].map((m) => m[1]);
  counters += names.length;

  // Rule 1 — an errors counter needs the denominator the SLI divides by.
  for (const n of names.filter((x) => x.endsWith("_errors_total"))) {
    const base = n.slice(0, -"_errors_total".length);
    if (!names.includes(`${base}_requests_total`)) {
      const near = names.find((x) => x.startsWith(base) && x !== n);
      errors.push(
        `${f}\n` +
          `    emits ${n} but not ${base}_requests_total.\n` +
          `    An availability SLI reads the pair; without the denominator the ratio\n` +
          `    evaluates empty and the objective reports NoData forever.` +
          (near ? `\n    Closest name present: ${near}` : ""),
      );
    }
  }

  // Rule 2 — a latency histogram is in seconds, in both name and unit.
  for (const m of src.matchAll(HISTOGRAM)) {
    histograms++;
    const name = m[1];
    if (!name.includes("_request_duration_")) continue;
    if (!name.endsWith("_seconds")) {
      errors.push(
        `${f}\n` +
          `    ${name} is a latency histogram not in seconds.\n` +
          `    A latency SLI reads <metric>_request_duration_seconds_{bucket,count} and\n` +
          `    thresholdSeconds names a bucket boundary in seconds, so this answers none\n` +
          `    of those queries.`,
      );
      continue;
    }
    // Named seconds — the declared unit must agree, or every value is off by 1000.
    const opts = src.slice(m.index, src.indexOf("});", m.index));
    const unit = /unit:\s*["']([^"']+)["']/.exec(opts);
    if (unit && unit[1] !== "s") {
      errors.push(
        `${f}\n` +
          `    ${name} is named _seconds but declares unit "${unit[1]}".\n` +
          `    That is worse than the wrong name: every value lands off by a factor of\n` +
          `    1000 in a series whose name says otherwise, and nothing reports it.`,
      );
    }
  }
}

if (counters === 0 || histograms === 0) {
  console.error(`matched ${counters} counter(s) and ${histograms} histogram(s) — the instrument`);
  console.error("patterns stopped matching, so this check is asserting nothing.");
  process.exit(2);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  process.exit(1);
}

console.log(
  `SLI metric names ok — ${counters} counters and ${histograms} histograms across ${files.length} template sources; ` +
    "every errors counter has its denominator and every latency histogram is in seconds.",
);
