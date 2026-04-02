/**
 * Dataset preparation pipeline.
 *
 * Reads raw JSONL training data, validates each example, splits into
 * train/validation/test sets, and writes the prepared files to the
 * output directory. Each output file is valid JSONL ready for upload
 * to a fine-tuning API.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { validateJsonl } from "./validate.js";
import { splitDataset } from "./split.js";
import type { TrainingExample, PrepareStats } from "./types.js";
import type { DatasetConfig } from "../config.js";
import { logger } from "../logger.js";

/**
 * Convert an array of training examples to JSONL format.
 */
function toJsonl(examples: TrainingExample[]): string {
  return examples.map((ex) => JSON.stringify(ex)).join("\n") + "\n";
}

/**
 * Run the full dataset preparation pipeline:
 *
 * 1. Read raw JSONL from inputPath
 * 2. Parse and validate each line
 * 3. Report validation errors
 * 4. Split valid examples into train/val/test
 * 5. Write split files to outputDir
 *
 * Returns statistics about the preparation process.
 */
export async function prepareDataset(config: DatasetConfig): Promise<PrepareStats> {
  const { inputPath, outputDir, trainRatio, valRatio, testRatio } = config;

  // Read raw data
  logger.info("Reading raw dataset", { inputPath });
  const content = await readFile(inputPath, "utf-8");

  // Validate
  logger.info("Validating training examples");
  const { valid, results, parseErrors } = validateJsonl(content);

  // Report parse errors
  for (const err of parseErrors) {
    logger.warn(`JSON parse error on line ${err.line}`, { error: err.error });
  }

  // Report validation errors
  const invalid = results.filter((r) => !r.valid);
  for (const result of invalid) {
    logger.warn(`Invalid example at index ${result.index}`, {
      errors: result.errors,
    });
  }

  logger.info("Validation complete", {
    total: results.length + parseErrors.length,
    valid: valid.length,
    invalid: invalid.length + parseErrors.length,
  });

  if (valid.length === 0) {
    throw new Error("No valid training examples found. Check your input data.");
  }

  // Split
  logger.info("Splitting dataset", { trainRatio, valRatio, testRatio });
  const split = splitDataset(valid, { trainRatio, valRatio, testRatio });

  // Write output files
  await mkdir(outputDir, { recursive: true });

  const files = [
    { name: "train.jsonl", data: split.train },
    { name: "validation.jsonl", data: split.validation },
    { name: "test.jsonl", data: split.test },
  ];

  for (const file of files) {
    const filePath = join(outputDir, file.name);
    await writeFile(filePath, toJsonl(file.data), "utf-8");
    logger.info(`Wrote ${file.name}`, { count: file.data.length, path: filePath });
  }

  return {
    totalExamples: results.length + parseErrors.length,
    validExamples: valid.length,
    invalidExamples: invalid.length + parseErrors.length,
    trainCount: split.train.length,
    valCount: split.validation.length,
    testCount: split.test.length,
    outputDir,
  };
}
