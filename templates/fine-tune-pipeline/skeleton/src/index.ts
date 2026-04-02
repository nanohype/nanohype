/**
 * CLI entry point for the __PROJECT_NAME__ fine-tuning pipeline.
 *
 * Commands:
 *   prepare               Validate, split, and write training data
 *   train                 Submit a fine-tuning job to the training provider
 *   train:status <id>     Check the status of a fine-tuning job
 *   train:list            List recent fine-tuning jobs
 *   eval                  Compare base model vs fine-tuned model outputs
 */

import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { prepareDataset } from "./dataset/prepare.js";
import { getProvider, DEFAULT_PROVIDER } from "./training/index.js";
import { logger } from "./logger.js";
import { join } from "node:path";

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
    console.error("  tsx src/index.ts eval                    Compare base vs fine-tuned model");
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
    if (!config.eval.fineTunedModel) {
      console.error("Error: FINE_TUNED_MODEL environment variable is required for eval.");
      console.error("Set it to the model ID from a completed fine-tuning job.");
      process.exit(1);
    }

    // Dynamic import — eval module is conditional
    const { runEvalComparison } = await import("./eval/compare.js");

    const provider = getProvider(config.training.provider ?? DEFAULT_PROVIDER);
    const testFile = join(config.dataset.outputDir, "test.jsonl");

    logger.info("Starting evaluation", {
      baseModel: config.training.baseModel,
      fineTunedModel: config.eval.fineTunedModel,
      sampleSize: config.eval.sampleSize,
    });

    const report = await runEvalComparison(
      {
        testFile,
        baseModel: config.training.baseModel,
        fineTunedModel: config.eval.fineTunedModel,
        sampleSize: config.eval.sampleSize,
      },
      provider,
    );

    console.log("\nEvaluation complete:");
    console.log(`  Comparisons:       ${report.aggregate.totalComparisons}`);
    console.log(`  Exact match rate:  ${(report.aggregate.exactMatchRate * 100).toFixed(1)}%`);
    console.log(`  Avg overlap score: ${report.aggregate.averageOverlapScore.toFixed(3)}`);
    console.log(`  Avg length ratio:  ${report.aggregate.averageLengthRatio.toFixed(2)}`);
    console.log(`  Avg base length:   ${report.aggregate.averageBaseLength.toFixed(0)} chars`);
    console.log(`  Avg FT length:     ${report.aggregate.averageFineTunedLength.toFixed(0)} chars`);
    console.log(`  Duration:          ${(report.durationMs / 1000).toFixed(1)}s`);

    // Print individual comparisons in debug mode
    if (process.env.LOG_LEVEL === "debug") {
      console.log("\nDetailed comparisons:");
      for (const comp of report.comparisons) {
        console.log(`\n  Prompt: ${comp.prompt.slice(0, 80)}...`);
        console.log(`  Base:   ${comp.baseOutput.slice(0, 120)}...`);
        console.log(`  FT:     ${comp.fineTunedOutput.slice(0, 120)}...`);
        console.log(`  Overlap: ${comp.metrics.overlapScore.toFixed(3)}`);
      }
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

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});
