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

const llmSchema = z.object({
  provider: z.string().default("__LLM_PROVIDER__"),
  anthropicApiKey: z.string().default(""),
  openaiApiKey: z.string().default(""),
  model: z.string().default("claude-sonnet-4-20250514"),
  temperature: z.coerce.number().min(0).max(2).default(0.1),
  maxTokens: z.coerce.number().int().positive().default(4096),
});

const imageSchema = z.object({
  maxDimension: z.coerce.number().int().positive().default(2048),
  detail: z.string().default("high"),
});

const audioSchema = z.object({
  transcriptionModel: z.string().default("whisper-1"),
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
 * - AUDIO_TRANSCRIPTION_MODEL, AUDIO_MAX_DURATION_SECONDS
 * - VIDEO_FRAME_INTERVAL_SECONDS, VIDEO_MAX_FRAMES
 * - OUTPUT_FORMAT, LOG_LEVEL
 */
export function loadConfig(): Config {
  const env = process.env;

  return configSchema.parse({
    llm: {
      provider: env.LLM_PROVIDER,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      openaiApiKey: env.OPENAI_API_KEY,
      model: env.LLM_MODEL,
      temperature: env.LLM_TEMPERATURE,
      maxTokens: env.LLM_MAX_TOKENS,
    },
    image: {
      maxDimension: env.IMAGE_MAX_DIMENSION,
      detail: env.IMAGE_DETAIL,
    },
    audio: {
      transcriptionModel: env.AUDIO_TRANSCRIPTION_MODEL,
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
