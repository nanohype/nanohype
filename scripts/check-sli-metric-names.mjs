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
// 2. A DURATION HISTOGRAM IS IN SECONDS.
//    A latency SLI reads `<m>_request_duration_seconds_{bucket,count}` and
//    `thresholdSeconds` names a bucket boundary in seconds. A histogram called
//    `_duration_ms` answers none of those queries. Seconds is also the OTel and
//    Prometheus base unit, so a `_ms` series is wrong against the convention
//    every dashboard and alert in the org already assumes, not only against the
//    SLI contract. So the name and the declared unit have to agree, and both
//    have to be base units.
//
// 3. AND IT IS FED SECONDS.
//    A histogram renamed to `_seconds` while a call site still records
//    `performance.now() - start` is worse than the wrong name: every value lands
//    off by a factor of 1000, in a series whose name and unit both say
//    otherwise, and no gate above this one can see it. A rename touches one
//    line; the call sites are spread across the module. So every `.record()` on
//    a seconds-named duration histogram has to show its conversion — a division
//    by 1000, or a value already named seconds.
//
// Usage: node scripts/check-sli-metric-names.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES = "templates";

const COUNTER = /createCounter\(\s*["']([a-z0-9_]+)["']/g;
const HISTOGRAM = /createHistogram\(\s*["']([a-z0-9_]+)["']/g;

// The instrument's variable name alongside its series name, so rule 3 can find
// the call sites. The series name may sit on the line after the open paren.
const HISTOGRAM_BINDING =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\w+\.createHistogram\(\s*["']([a-z0-9_]+)["']/g;

// A recorded value has to show its conversion: an explicit division by 1000, or
// a value whose own name already says seconds.
const CONVERTS = /\/\s*1000\b|[Ss]econds\b/;

// The first argument of a call, given the index just past its open paren.
// Depth-aware and string-aware, so a comma inside `{ operation: "get" }` or
// inside a quoted label does not end the argument early.
function firstArgument(src, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return src.slice(from, i);
      depth--;
    } else if (c === "," && depth === 0) return src.slice(from, i);
  }
  return null;
}

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

  // Rule 2 — a duration histogram is in seconds, in both name and unit.
  for (const m of src.matchAll(HISTOGRAM)) {
    histograms++;
    const name = m[1];
    if (!name.includes("_duration_")) continue;
    if (!name.endsWith("_seconds")) {
      errors.push(
        `${f}\n` +
          `    ${name} is a duration histogram not in seconds.\n` +
          `    Seconds is the base unit Prometheus and OTel both assume, and a latency SLI\n` +
          `    reads <metric>_request_duration_seconds_{bucket,count} with thresholdSeconds\n` +
          `    naming a bucket boundary in seconds — so this answers none of those queries.`,
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

// Rule 3 — every recorded value shows its conversion to seconds.
//
// Scoped per template, because instrument variables are module-scoped and two
// templates each declare a `cacheOperationDuration` over different series.
const byTemplate = new Map();
for (const f of files) {
  const root = f.split("/").slice(0, 2).join("/");
  if (!byTemplate.has(root)) byTemplate.set(root, []);
  byTemplate.get(root).push(f);
}

let instrumentCount = 0;
let recordSites = 0;

for (const group of byTemplate.values()) {
  const instruments = new Map();
  for (const f of group) {
    for (const m of readFileSync(f, "utf-8").matchAll(HISTOGRAM_BINDING)) {
      const [, variable, series] = m;
      if (series.includes("_duration_") && series.endsWith("_seconds")) {
        instruments.set(variable, series);
      }
    }
  }
  if (instruments.size === 0) continue;
  instrumentCount += instruments.size;

  for (const f of group) {
    const src = readFileSync(f, "utf-8");
    for (const [variable, series] of instruments) {
      for (const m of src.matchAll(new RegExp(`\\b${variable}\\.record\\(`, "g"))) {
        const arg = firstArgument(src, m.index + m[0].length);
        if (arg === null) continue;
        recordSites++;
        if (CONVERTS.test(arg)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        errors.push(
          `${f}:${line}\n` +
            `    ${variable}.record(${arg.trim()}) feeds ${series} a value that never\n` +
            `    converts to seconds. performance.now() and Date.now() are milliseconds, so\n` +
            `    this lands every observation off by a factor of 1000 in a series whose name\n` +
            `    and unit both say otherwise.\n` +
            `    Divide by 1000 at the call site, or record a value named for seconds.`,
        );
      }
    }
  }
}

if (counters === 0 || histograms === 0) {
  console.error(`matched ${counters} counter(s) and ${histograms} histogram(s) — the instrument`);
  console.error("patterns stopped matching, so this check is asserting nothing.");
  process.exit(2);
}

if (instrumentCount === 0 || recordSites === 0) {
  console.error(
    `rule 3 bound ${instrumentCount} seconds-named duration histogram(s) to ${recordSites} call site(s) —`,
  );
  console.error("the binding or call-site pattern stopped matching, so it is asserting nothing.");
  process.exit(2);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  process.exit(1);
}

console.log(
  `SLI metric names ok — ${counters} counters and ${histograms} histograms across ${files.length} template sources; ` +
    "every errors counter has its denominator, every duration histogram is in seconds, and all " +
    `${recordSites} call sites on those ${instrumentCount} instruments convert.`,
);
