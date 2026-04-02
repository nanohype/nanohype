/**
 * Configuration management using Zod schema validation.
 *
 * Loads all pipeline configuration from environment variables with sensible
 * defaults. Each component (dataset, training, eval) has its own settings
 * group, and the top-level config composes them into a single validated
 * configuration object.
 */

import "dotenv/config";
import { z } from "zod";

const datasetSchema = z.object({
  inputPath: z.string().default("./data/examples/raw.jsonl"),
  outputDir: z.string().default("./data/prepared"),
  trainRatio: z.coerce.number().min(0).max(1).default(0.8),
  valRatio: z.coerce.number().min(0).max(1).default(0.1),
  testRatio: z.coerce.number().min(0).max(1).default(0.1),
});

const trainingSchema = z.object({
  provider: z.string().default("__PROVIDER__"),
  baseModel: z.string().default("gpt-4o-mini-2024-07-18"),
  epochs: z.coerce.number().int().positive().optional(),
  learningRateMultiplier: z.coerce.number().positive().optional(),
  batchSize: z.coerce.number().int().positive().optional(),
  suffix: z.string().default("__PROJECT_NAME__"),
  openaiApiKey: z.string().default(""),
});

const evalSchema = z.object({
  fineTunedModel: z.string().optional(),
  sampleSize: z.coerce.number().int().positive().default(20),
});

const configSchema = z.object({
  dataset: datasetSchema,
  training: trainingSchema,
  eval: evalSchema,
});

export type DatasetConfig = z.infer<typeof datasetSchema>;
export type TrainingConfig = z.infer<typeof trainingSchema>;
export type EvalConfig = z.infer<typeof evalSchema>;
export type Config = z.infer<typeof configSchema>;

/**
 * Load configuration from environment variables.
 *
 * Environment variable mapping:
 * - DATA_INPUT_PATH, DATA_OUTPUT_DIR
 * - SPLIT_TRAIN_RATIO, SPLIT_VAL_RATIO, SPLIT_TEST_RATIO
 * - BASE_MODEL, TRAINING_EPOCHS, LEARNING_RATE_MULTIPLIER, BATCH_SIZE, TRAINING_SUFFIX
 * - FINE_TUNED_MODEL, EVAL_SAMPLE_SIZE
 * - OPENAI_API_KEY
 */
export function loadConfig(): Config {
  const env = process.env;

  return configSchema.parse({
    dataset: {
      inputPath: env.DATA_INPUT_PATH,
      outputDir: env.DATA_OUTPUT_DIR,
      trainRatio: env.SPLIT_TRAIN_RATIO,
      valRatio: env.SPLIT_VAL_RATIO,
      testRatio: env.SPLIT_TEST_RATIO,
    },
    training: {
      provider: env.TRAINING_PROVIDER,
      baseModel: env.BASE_MODEL,
      epochs: env.TRAINING_EPOCHS || undefined,
      learningRateMultiplier: env.LEARNING_RATE_MULTIPLIER || undefined,
      batchSize: env.BATCH_SIZE || undefined,
      suffix: env.TRAINING_SUFFIX,
      openaiApiKey: env.OPENAI_API_KEY,
    },
    eval: {
      fineTunedModel: env.FINE_TUNED_MODEL || undefined,
      sampleSize: env.EVAL_SAMPLE_SIZE,
    },
  });
}
