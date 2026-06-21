#!/usr/bin/env tsx

import { validateBootstrap } from "../src/bootstrap.js";
import { resolve } from "node:path";
import { runEvals } from "../src/runner.js";

/**
 * CLI entrypoint for running eval suites.
 *
 * Usage:
 *   npx tsx bin/run-evals.ts [options]
 *
 * Options:
 *   --suites <glob>      Glob pattern for suite files (default: "suites/*.yaml")
 *   --reporter <type>    Reporter: "console" or "json" (default: "console")
 *   --provider <name>    LLM provider override (any registered provider name)
 *   --concurrency <n>    Max parallel cases per suite (default: 5)
 *   --output <path>      Output file for JSON reporter (stdout if omitted)
 */

function parseArgs(argv: string[]): {
  suites: string;
  reporter: "console" | "json";
  provider?: string;
  concurrency: number;
  output?: string;
} {
  const args = {
    suites: "suites/*.yaml",
    reporter: "console" as "console" | "json",
    provider: undefined as string | undefined,
    concurrency: 5,
    output: undefined as string | undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--suites":
        args.suites = argv[++i]!;
        break;
      case "--reporter":
        args.reporter = argv[++i] as "console" | "json";
        break;
      case "--provider":
        args.provider = argv[++i];
        break;
      case "--concurrency":
        args.concurrency = parseInt(argv[++i]!, 10);
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--help":
        console.log("Usage: run-evals [--suites <glob>] [--reporter console|json] [--provider <name>] [--concurrency <n>] [--output <path>]");
        process.exit(0);
    }
  }

  return args;
}

async function main(): Promise<void> {
  validateBootstrap();

  const args = parseArgs(process.argv.slice(2));

  const results = await runEvals({
    suiteGlob: resolve(args.suites),
    reporter: args.reporter,
    provider: args.provider,
    concurrency: args.concurrency,
    outputFile: args.output,
  });

  // Exit with non-zero status if any evaluations failed
  const allPassed = results.every((suite) =>
    suite.cases.every((c) => c.pass),
  );

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
