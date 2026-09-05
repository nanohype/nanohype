/**
 * CLI entry point for the __PROJECT_NAME__ fine-tuning pipeline.
 *
 * Commands:
 *   prepare               Validate, split, and write training data
 *   train                 Submit a fine-tuning job to the training provider
 *   train:status <id>     Check the status of a fine-tuning job
 *   train:list            List recent fine-tuning jobs
 *   eval                  Run the eval corpus against the fine-tuned model
 */

import { join } from "node:path";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { prepareDataset } from "./dataset/prepare.js";
import { EmptyCorpusError } from "./eval/cases.js";
import { logger } from "./logger.js";
import { DEFAULT_PROVIDER, getProvider } from "./training/index.js";

async function main(): Promise<void> {
  validateBootstrap();

  const args = process.argv.slice(2);
  const command = args[0];

  const commands = ["prepare", "train", "train:status", "train:list", "eval"];

  if (!command || !commands.includes(command)) {
    console.error("Usage:");
    console.error("  tsx src/index.ts prepare                 Prepare and split training data");
    console.error("  tsx src/index.ts train                   Submit a fine-tuning job");
    console.error("  tsx src/index.ts train:status <job-id>   Check job status");
    console.error("  tsx src/index.ts train:list              List recent jobs");
    console.error("  tsx src/index.ts eval                    Run the eval corpus");
    process.exit(1);
  }

  const config = loadConfig();

  if (command === "prepare") {
    logger.info("Starting dataset preparation");
    const stats = await prepareDataset(config.dataset);

    console.log("\nDataset preparation complete:");
    console.log(`  Total examples:   ${stats.totalExamples}`);
    console.log(`  Valid examples:   ${stats.validExamples}`);
    console.log(`  Invalid examples: ${stats.invalidExamples}`);
    console.log(`  Train set:        ${stats.trainCount}`);
    console.log(`  Validation set:   ${stats.valCount}`);
    console.log(`  Test set:         ${stats.testCount}`);
    console.log(`  Output directory:  ${stats.outputDir}`);
  }

  if (command === "train") {
    const provider = getProvider(config.training.provider ?? DEFAULT_PROVIDER);
    const trainFile = join(config.dataset.outputDir, "train.jsonl");
    const valFile = join(config.dataset.outputDir, "validation.jsonl");

    logger.info("Submitting fine-tuning job", {
      provider: config.training.provider,
      baseModel: config.training.baseModel,
    });

    const status = await provider.createJob({
      trainingFile: trainFile,
      validationFile: valFile,
      baseModel: config.training.baseModel,
      epochs: config.training.epochs,
      learningRateMultiplier: config.training.learningRateMultiplier,
      batchSize: config.training.batchSize,
      suffix: config.training.suffix,
    });

    console.log("\nFine-tuning job submitted:");
    console.log(`  Job ID:     ${status.id}`);
    console.log(`  Status:     ${status.status}`);
    console.log(`  Base model: ${status.baseModel}`);
    console.log(`  Created:    ${status.createdAt}`);
    console.log(`\nCheck status with: tsx src/index.ts train:status ${status.id}`);
  }

  if (command === "train:status") {
    const jobId = args[1];
    if (!jobId) {
      console.error("Error: Please provide a job ID.");
      console.error("  tsx src/index.ts train:status <job-id>");
      process.exit(1);
    }

    const provider = getProvider(config.training.provider ?? DEFAULT_PROVIDER);
    const status = await provider.getJobStatus(jobId);

    console.log("\nJob status:");
    console.log(`  Job ID:           ${status.id}`);
    console.log(`  Status:           ${status.status}`);
    console.log(`  Base model:       ${status.baseModel}`);
    if (status.fineTunedModel) {
      console.log(`  Fine-tuned model: ${status.fineTunedModel}`);
    }
    if (status.error) {
      console.log(`  Error:            ${status.error}`);
    }
    console.log(`  Created:          ${status.createdAt}`);
    if (status.finishedAt) {
      console.log(`  Finished:         ${status.finishedAt}`);
    }
  }

  if (command === "train:list") {
    const provider = getProvider(config.training.provider ?? DEFAULT_PROVIDER);
    const jobs = await provider.listJobs(10);

    if (jobs.length === 0) {
      console.log("\nNo fine-tuning jobs found.");
      return;
    }

    console.log("\nRecent fine-tuning jobs:");
    for (const job of jobs) {
      const model = job.fineTunedModel ? ` -> ${job.fineTunedModel}` : "";
      console.log(`  ${job.id}  ${job.status.padEnd(10)}  ${job.baseModel}${model}`);
    }
  }

  if (command === "eval") {
    // Dynamic import — eval module is conditional
    const { casePassed, runEvalComparison } = await import("./eval/compare.js");

    // The provider goes in as a factory, so no client is constructed until
    // the corpus has been read. A run with nothing to run reports an empty
    // corpus rather than a missing credential.
    const report = await runEvalComparison(
      {
        casesDir: join(import.meta.dirname, "eval", "cases"),
        baseModel: config.training.baseModel,
        fineTunedModel: config.eval.fineTunedModel,
      },
      () => getProvider(config.training.provider ?? DEFAULT_PROVIDER),
    );

    console.log("\nCases:");
    for (const outcome of report.outcomes) {
      const status = outcome.error ? "ERROR" : casePassed(outcome) ? "PASS" : "FAIL";
      console.log(`  [${outcome.evalCase.kind}] ${outcome.evalCase.name} ... ${status}`);

      if (outcome.error) {
        console.log(`    ${outcome.error}`);
      }
      for (const assertion of outcome.assertions) {
        if (!assertion.pass) {
          console.log(`    ${assertion.message}`);
        }
      }
    }

    console.log("\nBase vs fine-tuned:");
    console.log(`  Comparisons:       ${report.aggregate.totalComparisons}`);
    console.log(`  Exact match rate:  ${(report.aggregate.exactMatchRate * 100).toFixed(1)}%`);
    console.log(`  Avg overlap score: ${report.aggregate.averageOverlapScore.toFixed(3)}`);
    console.log(`  Avg length ratio:  ${report.aggregate.averageLengthRatio.toFixed(2)}`);
    console.log(`  Avg base length:   ${report.aggregate.averageBaseLength.toFixed(0)} chars`);
    console.log(`  Avg FT length:     ${report.aggregate.averageFineTunedLength.toFixed(0)} chars`);
    console.log(`  Duration:          ${(report.durationMs / 1000).toFixed(1)}s`);

    // Print the outputs themselves in debug mode
    if (process.env.LOG_LEVEL === "debug") {
      for (const outcome of report.outcomes) {
        if (!outcome.comparison) continue;
        console.log(`\n  Case:  ${outcome.evalCase.name}`);
        console.log(`  Base:  ${outcome.comparison.baseOutput.slice(0, 120)}...`);
        console.log(`  FT:    ${outcome.comparison.fineTunedOutput.slice(0, 120)}...`);
        console.log(`  Overlap: ${outcome.comparison.metrics.overlapScore.toFixed(3)}`);
      }
    }

    if (!report.passed) {
      process.exit(1);
    }
  }
}

// ── Graceful Shutdown ────────────────────────────────────────────────

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down...`);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err: unknown) => {
  // An empty corpus is a result, not a crash: it is the one failure a reader
  // would otherwise mistake for a pass, so it is reported in its own words.
  if (err instanceof EmptyCorpusError) {
    console.error(err.message);
    process.exit(1);
  }
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});
