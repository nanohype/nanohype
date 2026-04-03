// ── CLI Entry ───────────────────────────────────────────────────────
//
// Commands:
//   run               Run eval suites and compare against baseline
//   compare           Compare a results file against stored baseline
//   update-baseline   Save current results as the new baseline
//
// Flags:
//   --json            Output results as JSON (for CI piping)
//   --results <path>  Path to eval results JSON file (for compare)
//   --format <type>   Output format: "json" or "markdown" (for compare)
//   --fail-on-regression  Exit non-zero if regression detected
//

import { readFile, writeFile } from "node:fs/promises";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createEvalRunner } from "./runner.js";
import { loadBaseline, saveBaseline, compareBaseline } from "./baseline.js";
import { formatMarkdownReport } from "./reporter.js";
import type { SuiteScore } from "./types.js";

validateBootstrap();

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  switch (command) {
    case "run": {
      const runner = createEvalRunner(config, logger);
      const scores = await runner.run();

      // Compare against baseline
      const baseline = await loadBaseline(config.baselinePath);
      const comparison = compareBaseline(
        scores,
        baseline,
        config.regressionThreshold,
      );

      if (hasFlag("--json")) {
        process.stdout.write(JSON.stringify(scores, null, 2) + "\n");
      } else {
        const report = formatMarkdownReport(comparison, scores);
        process.stdout.write(report + "\n");
      }

      if (comparison.hasRegression) {
        logger.error("Regression detected", {
          regressed: comparison.suites
            .filter((s) => s.regressed)
            .map((s) => s.suite),
        });
        process.exit(1);
      }
      break;
    }

    case "compare": {
      const resultsPath = getFlag("--results");
      if (!resultsPath) {
        console.error("Usage: compare --results <path> [--format json|markdown] [--fail-on-regression]");
        process.exit(1);
      }

      const raw = await readFile(resultsPath, "utf-8");
      const scores: SuiteScore[] = JSON.parse(raw);
      const baseline = await loadBaseline(config.baselinePath);
      const comparison = compareBaseline(
        scores,
        baseline,
        config.regressionThreshold,
      );

      const format = getFlag("--format") ?? "json";

      if (format === "markdown") {
        const report = formatMarkdownReport(comparison, scores);
        process.stdout.write(report + "\n");
      } else {
        process.stdout.write(JSON.stringify(comparison, null, 2) + "\n");
      }

      if (hasFlag("--fail-on-regression") && comparison.hasRegression) {
        process.exit(1);
      }
      break;
    }

    case "update-baseline": {
      const resultsPath = getFlag("--results");
      let scores: SuiteScore[];

      if (resultsPath) {
        const raw = await readFile(resultsPath, "utf-8");
        scores = JSON.parse(raw);
      } else {
        logger.info("No --results flag, running eval suites first");
        const runner = createEvalRunner(config, logger);
        scores = await runner.run();
      }

      await saveBaseline(config.baselinePath, scores);
      logger.info("Baseline updated", {
        path: config.baselinePath,
        suites: scores.length,
      });

      // Write scores to stdout for piping
      process.stdout.write(JSON.stringify(scores, null, 2) + "\n");
      break;
    }

    default:
      console.error(
        "Usage: npx tsx src/ci-eval/index.ts <command>\n\n" +
        "Commands:\n" +
        "  run                Run eval suites and compare against baseline\n" +
        "  compare            Compare results file against baseline\n" +
        "  update-baseline    Save current results as new baseline\n",
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
