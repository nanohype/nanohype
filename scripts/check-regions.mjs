#!/usr/bin/env node
//
// check-regions.mjs — fail if the catalog names an AWS region the LLM policy
// does not list.
//
// The failure this exists to stop, which shipped:
//
//   A service-control policy denies every non-global action outside us-east-1
//   in each venture account, while standards/llm-policy.json listed us-west-2
//   first in regions_preferred. Six skeleton defaults followed it there —
//   `process.env.AWS_REGION ?? "us-west-2"` — so any scaffold that did not set
//   AWS_REGION called Bedrock in a denied region on its first run. Seven
//   .env.example files and two documented `make plan` commands carried the same
//   value. Nothing caught it because a region is just a string, and the one
//   test that touched the list asserted `toContain("us-west-2")` — pinning the
//   defect rather than the contract.
//
// This is the region twin of check-model-ids.mjs, and it fails the same way a
// model ID does: no compiler, linter or type checker has an opinion about a
// region string, so the only thing that can hold the line is a gate that reads
// the standard.
//
// The allowed set is derived from standards/llm-policy.json rather than listed
// here, so widening the catalog to a second region is one edit to the standard
// and this gate follows. Same reason check-model-ids.mjs and
// check-slo-constants.mjs read their values from the standard instead of
// transcribing them.
//
// Scope is the consumer-visible surface: templates/ (skeleton code, .env
// examples, documented commands) and standards/ (so the standards cannot
// contradict each other). Deliberately NOT the test suites — sdk/__tests__
// pins regions_preferred directly, and a test that explains a past defect has
// to be able to name the region it was.
//
// Usage: node scripts/check-regions.mjs [root]

import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const STANDARD = resolve(root, "standards/llm-policy.json");

const allowed = new Set(JSON.parse(readFileSync(STANDARD, "utf-8")).content.regions_preferred);

if (!allowed.size) {
  console.error(
    `check-regions: ${relative(root, STANDARD)} declares an empty regions_preferred.\n` +
      `The gate cannot derive an allowed set from nothing — name at least one region.`,
  );
  process.exit(1);
}

// An AWS region code, anchored on the direction word so it cannot sweep in a
// package version, a locale tag, or arbitrary hyphenated prose. The partition
// prefix is a general two-to-four letter code rather than a list of the ones
// that exist today: AWS adds regions, and a gate that enumerates prefixes goes
// quietly blind to every one added after it was written — the same
// enumerate-what-you-know-about failure this file exists to catch.
const REGION =
  /\b[a-z]{2,4}(?:-gov|-iso[a-z]?)?-(?:north|south|east|west|central|northeast|northwest|southeast|southwest)-[0-9]\b/g;

// dist/ is gitignored build output inside skeletons compiled locally — a hit
// there duplicates one this gate already reports from source, or is a false one
// for code that no longer exists. This script is skipped because naming the bad
// regions is its job.
//
// Pruned during the walk rather than filtered after it: seven skeletons carry an
// installed node_modules, which is 64k files against ~1k real ones, and a
// post-filter still pays to enumerate every one of them.
const PRUNE = new Set([
  "node_modules",
  "dist",
  ".git",
  ".turbo",
  "coverage",
  "htmlcov",
  "__pycache__",
]);
const SKIP = /scripts[/\\]check-regions\.mjs$/;
const exclude = (p) => PRUNE.has(typeof p === "string" ? p : p.name);

// Everything that is not demonstrably binary, rather than an allowlist of
// extensions. The allowlist is how a gate goes blind to the surface it claims to
// cover: the first version of this file scanned sixteen extensions and could not
// see a Dockerfile, a Makefile, or a Helm _helpers.tpl — all of them fine places
// to hardcode a region, all of them under templates/. That is the same shape as
// the defect this gate exists to catch, one layer up. Binary suffixes are listed
// because reading them is pointless, not because the rest are trusted.
const BINARY =
  /\.(?:png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|tgz|bz2|xz|woff2?|ttf|eot|otf|mp4|webm|wasm|pyc|so|dylib|dll|exe|bin)$/i;

const SCOPES = ["templates", "standards"];
const files = SCOPES.flatMap((scope) => globSync(`${scope}/**/*`, { cwd: root, exclude })).filter(
  (p) => !BINARY.test(p) && !SKIP.test(p),
);

const offenders = [];
let scanned = 0;

for (const rel of files) {
  const path = resolve(root, rel);
  let text;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    continue; // a directory, or an unreadable entry, matched the glob
  }
  scanned++;

  for (const [i, line] of text.split("\n").entries()) {
    for (const region of line.match(REGION) ?? []) {
      if (!allowed.has(region)) {
        offenders.push(`${relative(root, path)}:${i + 1}  ${region}`);
      }
    }
  }
}

if (offenders.length) {
  const list = [...allowed].sort().join(", ");
  console.error(
    `check-regions: ${offenders.length} reference(s) to a region the LLM policy does not list.\n` +
      `Allowed: ${list}\n` +
      `A scaffold that defaults to a denied region fails on its first call, and the\n` +
      `operator sees an AccessDenied that reads like a missing IAM permission rather\n` +
      `than a region guardrail. Either use an allowed region, or widen\n` +
      `standards/llm-policy.json — this gate reads its allowed set from there.\n`,
  );
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}

// State the scope that was actually walked rather than claiming totality. A
// gate that reports "everything is clean" over a subset is how a blind spot
// survives review — the reader has no way to tell which files were never
// opened. Scope is deliberately templates/ and standards/: the test suites are
// excluded so a test explaining a past defect can still name the region it was.
console.log(
  `check-regions: ${scanned} file(s) under ${SCOPES.map((s) => `${s}/`).join(" and ")} name ` +
    `no AWS region outside the LLM policy's list (${[...allowed].sort().join(", ")}). ` +
    `Scope excludes test suites and the rest of the repository.`,
);
