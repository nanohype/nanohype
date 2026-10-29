/**
 * Configuration management using Zod schema validation.
 *
 * Loads all pipeline configuration from environment variables with sensible
 * defaults. Each component (LLM, image, audio, video, output) has its own
 * settings group, and the top-level config composes them into a single
 * validated configuration object.
 */

import "dotenv/config";
import { z } from "zod";
import { DEFAULT_TRANSCRIPTION_TIMEOUT_MS, parseTimeoutMs } from "./resilience/request-timeout.js";

/** An empty environment value (`LLM_TEMPERATURE=`) reads as unset. */
function unsetWhenEmpty(value: unknown): unknown {
  return value === "" ? undefined : value;
}

const llmSchema = z.object({
  provider: z.string().default("__LLM_PROVIDER__"),
  // The inference-profile ID the bedrock provider calls. The gateway
  // provider names a route instead, MODEL_ROUTE.
  model: z.string().default("us.anthropic.claude-sonnet-5"),
  // Optional, so a provider can tell a configured temperature from none; an
  // empty LLM_TEMPERATURE is unset. The bedrock provider sends it to a model
  // of a family other than Claude. Neither provider sends one to Claude: the
  // Messages API rejects sampling parameters, and Claude on Bedrock refuses
  // them on some models and under thinking.
  temperature: z.preprocess(unsetWhenEmpty, z.coerce.number().min(0).max(2).optional()),
  maxTokens: z.coerce.number().int().positive().default(4096),
});

const imageSchema = z.object({
  maxDimension: z.coerce.number().int().positive().default(2048),
  detail: z.string().default("high"),
});

const audioSchema = z.object({
  // The s3://bucket/prefix Amazon Transcribe reads staged audio from and
  // writes its transcript to.
  s3Uri: z.string().default(""),
  // The language the audio is in; an empty AUDIO_LANGUAGE_CODE lets
  // Transcribe identify it.
  languageCode: z.preprocess(unsetWhenEmpty, z.string().optional()),
  // Read with parseTimeoutMs: a whole number of milliseconds from 1 to the
  // longest delay a Node.js timer holds.
  transcriptionTimeoutMs: z.number().int().positive(),
  maxDurationSeconds: z.coerce.number().int().positive().default(600),
});

const videoSchema = z.object({
  frameIntervalSeconds: z.coerce.number().positive().default(2),
  maxFrames: z.coerce.number().int().positive().default(30),
});

const configSchema = z.object({
  llm: llmSchema,
  image: imageSchema,
  audio: audioSchema,
  video: videoSchema,
  outputFormat: z.string().default("json"),
  logLevel: z.string().default("info"),
});

export type LlmConfig = z.infer<typeof llmSchema>;
export type ImageConfig = z.infer<typeof imageSchema>;
export type AudioConfig = z.infer<typeof audioSchema>;
export type VideoConfig = z.infer<typeof videoSchema>;
export type Config = z.infer<typeof configSchema>;

/**
 * Load configuration from environment variables.
 *
 * Environment variable mapping uses prefixed names:
 * - LLM_PROVIDER, LLM_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS
 * - IMAGE_MAX_DIMENSION, IMAGE_DETAIL
 * - TRANSCRIBE_S3_URI, AUDIO_LANGUAGE_CODE, AUDIO_TRANSCRIPTION_TIMEOUT_MS,
 *   AUDIO_MAX_DURATION_SECONDS
 * - VIDEO_FRAME_INTERVAL_SECONDS, VIDEO_MAX_FRAMES
 * - OUTPUT_FORMAT, LOG_LEVEL
 */
export function loadConfig(): Config {
  const env = process.env;

  return configSchema.parse({
    llm: {
      provider: env.LLM_PROVIDER,
      model: env.LLM_MODEL,
      temperature: env.LLM_TEMPERATURE,
      maxTokens: env.LLM_MAX_TOKENS,
    },
    image: {
      maxDimension: env.IMAGE_MAX_DIMENSION,
      detail: env.IMAGE_DETAIL,
    },
    audio: {
      s3Uri: env.TRANSCRIBE_S3_URI,
      languageCode: env.AUDIO_LANGUAGE_CODE,
      transcriptionTimeoutMs: parseTimeoutMs(
        "AUDIO_TRANSCRIPTION_TIMEOUT_MS",
        env.AUDIO_TRANSCRIPTION_TIMEOUT_MS,
        DEFAULT_TRANSCRIPTION_TIMEOUT_MS,
      ),
      maxDurationSeconds: env.AUDIO_MAX_DURATION_SECONDS,
    },
    video: {
      frameIntervalSeconds: env.VIDEO_FRAME_INTERVAL_SECONDS,
      maxFrames: env.VIDEO_MAX_FRAMES,
    },
    outputFormat: env.OUTPUT_FORMAT,
    logLevel: env.LOG_LEVEL,
  });
}
