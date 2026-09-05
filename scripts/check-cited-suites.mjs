#!/usr/bin/env node

//
// check-cited-suites.mjs — run the suite an exclusion's comment cites, and fail
// if that suite does not execute the files the exclusion removes.
//
// A coverage exclusion drops a file out of the denominator. Where the reason
// given is "another suite covers it", the file is not untested — it is measured
// somewhere else, and the sentence is the whole of the argument. So the
// sentence has to be true, and whether a suite covers a file is a fact about
// what runs.
//
// Reading cannot establish it. A suite that imports a module and never calls it
// satisfies every static test of "does this suite reach that file" while
// covering none of it, and `import "../providers/bullmq.js";` is one line. So
// this gate runs the cited suite with coverage pointed at exactly the files the
// exclusion removes, and asks whether any function in them was entered.
//
// FUNCTIONS, not statements. A module that self-registers a provider executes
// its top-level statements the moment anything imports it, so statement
// coverage is non-zero for a file nothing called — which is precisely the
// evasion above, wearing a number. A function is entered only by a caller.
//
// What this does NOT establish: that the suite exercises the file WELL. One
// function of forty is enough to pass here. The bar for how much is the
// per-file threshold in the config, and this gate is about whether the cited
// suite is a real answer at all.
//
// Usage: node scripts/check-cited-suites.mjs [root]

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { carriesBehaviour } from "./check-coverage-exclusions.mjs";
import { citedClaims, suiteFilesFor, TEST_FILE } from "./lib/exclusions.mjs";
import { skeletonConfigs, skeletonFiles, unaccountedSkeletons } from "./lib/skeletons.mjs";

const root = resolve(process.argv[2] ?? ".");

/**
 * Compile one exclusion pattern to a regex over skeleton-relative paths.
 * The patterns in use are `*` and `**` only — no braces, negation or `?` — so
 * this covers the vocabulary rather than pretending to be a glob library.
 */
function patternToRegex(pattern) {
  let out = "";
  const parts = pattern.split("/");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const last = i === parts.length - 1;
    if (part === "**") {
      out += last ? "(?:.*)?" : "(?:[^/]+/)*";
      continue;
    }
    out += part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    if (!last) out += "/";
  }
  return new RegExp(`^${out}$`);
}

/** Install a skeleton's dependencies, because the suite has to actually run. */
function install(skeleton) {
  if (existsSync(join(skeleton, "node_modules"))) return true;
  const result = spawnSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"],
    { cwd: skeleton, stdio: "inherit" },
  );
  return result.status === 0;
}

/**
 * Run `files` as the suite and report per-file coverage of `subjects`.
 *
 * The config's own `coverage.exclude` is overridden, because the subjects are
 * excluded by definition — measuring them is the question. Its thresholds are
 * overridden too: a floor computed over a different set of files is not what is
 * being asked.
 */
function coverageOf(skeleton, suiteFiles, subjects) {
  const out = mkdtempSync(join(tmpdir(), "cited-suites-"));
  try {
    const args = [
      "vitest",
      "run",
      ...suiteFiles,
      "--coverage.enabled",
      "--coverage.provider=v8",
      "--coverage.all",
      "--coverage.reporter=json-summary",
      `--coverage.reportsDirectory=${out}`,
      "--coverage.exclude=**/*.d.ts",
      "--coverage.thresholds.lines=0",
      "--coverage.thresholds.functions=0",
      "--coverage.thresholds.statements=0",
      "--coverage.thresholds.branches=0",
      ...subjects.map((s) => `--coverage.include=${s}`),
    ];
    const result = spawnSync("npx", args, { cwd: skeleton, encoding: "utf-8" });
    const summaryPath = join(out, "coverage-summary.json");
    if (!existsSync(summaryPath)) {
      return { error: (result.stderr || result.stdout || "").split("\n").slice(-25).join("\n") };
    }
    const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
    // Against the resolved directory: vitest reports realpaths, and on a
    // platform where the temp root is itself a link the two spellings of the
    // same directory produce a relative path that climbs out of it. Every file
    // then looks like one the report does not mention.
    const base = realpathSync(skeleton);
    const byFile = new Map();
    for (const [absolute, metrics] of Object.entries(summary)) {
      if (absolute === "total") continue;
      byFile.set(relative(base, absolute).split("\\").join("/"), metrics);
    }
    return { byFile, ran: result.status === 0 };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const configs = skeletonConfigs(root);
  if (configs.length === 0) {
    console.error(
      "check-cited-suites: found no vitest config under any skeleton — the walk matched " +
        "nothing, so this gate is asserting nothing.",
    );
    process.exit(2);
  }

  // The same accounting the exclusion gate applies, from the same module, so
  // the two cannot come to different views of what a complete corpus is.
  const unaccounted = unaccountedSkeletons(root, configs);
  if (unaccounted.length) {
    console.error(
      `check-cited-suites: ${unaccounted.length} skeleton package(s) declare vitest and hold ` +
        "no config this walk reached, so the corpus is smaller than the one that exists.\n",
    );
    for (const d of unaccounted) console.error(`  ${relative(root, d.dir)}`);
    process.exit(2);
  }

  const failures = [];
  const held = [];
  const unmeasurable = [];
  let claimsFound = 0;

  for (const config of configs) {
    const skeleton = dirname(config);
    const where = relative(root, config);
    const claims = citedClaims(readFileSync(config, "utf-8"), config);
    if (claims.length === 0) continue;

    const all = skeletonFiles(skeleton);

    for (const claim of claims) {
      claimsFound++;
      const suiteFiles = suiteFilesFor(claim.word, all);
      if (suiteFiles.length === 0) {
        failures.push(
          `${where}:${claim.line}  cites a ${claim.word} suite — ${claim.comment}\n` +
            `      the skeleton ships no test file this suite could be. Add it, or say what ` +
            `actually keeps\n      the files out of the denominator.`,
        );
        continue;
      }

      // A test file removed from the denominator is not a claim that some suite
      // covers it, and neither is a barrel or a type-only module: there is no
      // function in it for a suite to enter.
      const subjects = [];
      for (const entry of claim.entries) {
        if (entry === null) continue;
        const re = patternToRegex(entry);
        for (const file of all) {
          if (!re.test(file)) continue;
          if (!/\.tsx?$/.test(file) || TEST_FILE.test(file)) continue;
          const source = readFileSync(join(skeleton, file), "utf-8");
          if (!carriesBehaviour(source, file)) continue;
          if (!subjects.includes(file)) subjects.push(file);
        }
      }

      if (subjects.length === 0) {
        unmeasurable.push(
          `${where}:${claim.line}  cites a ${claim.word} suite and its entries remove no file ` +
            "carrying a function",
        );
        continue;
      }

      if (!install(skeleton)) {
        console.error(`check-cited-suites: could not install dependencies for ${where}`);
        process.exit(2);
      }

      const measured = coverageOf(skeleton, suiteFiles, subjects);
      if (measured.error !== undefined) {
        console.error(
          `check-cited-suites: the ${claim.word} suite of ${where} produced no coverage report.\n` +
            "A cited suite that cannot run is not covering anything, but this gate reports what\n" +
            "it measured and it measured nothing, so it stops rather than deciding.\n",
        );
        console.error(measured.error);
        process.exit(2);
      }

      const uncovered = [];
      const nothingToEnter = [];
      const entered = [];
      for (const subject of subjects) {
        const metrics = measured.byFile.get(subject);
        // A file the report does not mention was not instrumented; a file with
        // no function has nothing a suite could enter. Neither is evidence
        // against the claim, and neither is evidence for it, so both are
        // counted apart from the files that were actually entered.
        if (!metrics || metrics.functions.total === 0) {
          nothingToEnter.push(subject);
          continue;
        }
        if (metrics.functions.covered === 0) uncovered.push(subject);
        else entered.push(subject);
      }

      if (uncovered.length === 0 && entered.length === 0) {
        // Every file the claim covers is a barrel or a constant table. Running
        // the suite settled nothing, and reporting it as held would be this
        // gate asserting over an empty set.
        unmeasurable.push(
          `${where}:${claim.line}  cites a ${claim.word} suite, and every file its entries ` +
            "remove declares no function to enter",
        );
      } else if (uncovered.length) {
        failures.push(
          `${where}:${claim.line}  cites a ${claim.word} suite — ${claim.comment}\n` +
            `      ran ${suiteFiles.join(", ")}\n` +
            `      and it entered no function of:\n` +
            uncovered.map((f) => `        ${f}`).join("\n"),
        );
      } else {
        const aside = nothingToEnter.length
          ? `; ${nothingToEnter.length} declare no function to enter`
          : "";
        held.push(
          `${where}:${claim.line}  the ${claim.word} suite enters a function of ` +
            `${entered.join(", ")}${aside}`,
        );
      }
    }
  }

  if (failures.length) {
    console.error(
      `check-cited-suites: ${failures.length} coverage-exclusion comment(s) cite a suite that ` +
        "does not cover the files the exclusion removes.\n" +
        "The file is out of the denominator because of that sentence. Either the suite covers\n" +
        "it — in which case something in the file gets called when the suite runs — or the\n" +
        "sentence names the wrong reason and the honest one goes in its place.\n",
    );
    for (const f of failures) console.error(`  ${f}\n`);
    process.exit(1);
  }

  const scope =
    `check-cited-suites: ${configs.length} skeleton vitest config(s), ` +
    `${claimsFound} exclusion comment(s) citing a suite.`;

  if (claimsFound === 0) {
    console.log(
      `${scope}\n` +
        "No exclusion in the catalog argues that another suite covers what it removes, so\n" +
        "there is no such claim to run. The configs were read; the claim corpus is empty.",
    );
  } else {
    console.log(
      `${scope}\n\n` +
        `${held.map((h) => `  ${h}`).join("\n")}\n` +
        `${unmeasurable.map((u) => `  ${u}`).join("\n")}${unmeasurable.length ? "\n" : ""}` +
        "\n" +
        "Each comment was attributed to the entries it argues for by position — the entry it\n" +
        "trails, the run of entries it leads, or whatever no comment inside the array claims\n" +
        "when it sits above `exclude:` — and each entry resolved against the skeleton's real\n" +
        "tree. The cited suite was then run, and every file it removes that declares a\n" +
        "function had one entered.\n" +
        "\n" +
        "What that does not say:\n" +
        "  - that the suite exercises the file well. One function of forty passes here. How\n" +
        "    much is the per-file threshold's question, not this gate's.\n" +
        "  - anything about a file the exclusion removes that declares no function — a barrel\n" +
        "    or a constant table. There is nothing in it for a suite to enter, so running one\n" +
        "    answers nothing about it either way.\n" +
        "  - anything about an exclusion whose comment cites no suite. This gate checks the\n" +
        "    claim that is made, and an entry carrying no claim carries none to check.\n" +
        "  - anything about a suite the catalog names in a word outside the list this gate\n" +
        "    reads as citing one. The words are `" +
        "integration, e2e, end-to-end, smoke, acceptance`.",
    );
  }
}
