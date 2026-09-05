#!/usr/bin/env node

//
// run-script-tests.mjs — run the gate suites, and fail rather than report
// success over none of them.
//
// `node --test 'scripts/__tests__/*.test.mjs'` exits 0 when the glob matches
// nothing, printing a summary of zeroes. A suite renamed to `.spec.mjs` — a
// suffix `node --test` accepts on its own — leaves the run silently, and the
// job that was gating the gates goes on passing.
//
// So the corpus is walked rather than matched: every `.mjs` under the tests
// directory is a suite, whatever it is called. Nothing found is a failure, and
// so is a run that executed files and no tests.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const testsDir = join(here, "__tests__");

const suites = readdirSync(testsDir)
  .filter((name) => name.endsWith(".mjs"))
  .sort()
  .map((name) => join(testsDir, name));

if (suites.length === 0) {
  console.error(
    `run-script-tests: no suite under ${testsDir}. The gates this runs are what stands\n` +
      "between a classifier and the tree it decides, so finding none is this walk breaking\n" +
      "rather than the repository losing its tests.",
  );
  process.exit(2);
}

const tap = join(tmpdir(), `script-tests-${process.pid}.tap`);
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=tap",
    `--test-reporter-destination=${tap}`,
    ...suites,
  ],
  { stdio: "inherit" },
);

let ran = 0;
try {
  ran = Number((readFileSync(tap, "utf-8").match(/^# tests (\d+)$/m) ?? [])[1] ?? 0);
} finally {
  rmSync(tap, { force: true });
}

if (result.status !== 0) process.exit(result.status ?? 1);

if (ran === 0) {
  console.error(
    `run-script-tests: ${suites.length} suite file(s) ran and declared no test between them.\n` +
      "A file that loads and asserts nothing exits 0 the same way a passing suite does.",
  );
  process.exit(2);
}

console.log(
  `\nrun-script-tests: ${ran} test(s) across ${suites.length} suite file(s) in ${resolve(testsDir)}.`,
);
