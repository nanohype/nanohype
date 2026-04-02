/**
 * Pipeline orchestrator.
 *
 * Detects the modality of an input file based on its MIME type, routes
 * it to the appropriate processor, sends the processed content to the
 * configured LLM provider for analysis, and returns validated
 * structured output.
 */

import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { lookup } from "mime-types";
import type { Config } from "./config.js";
import type { ProcessedInput, Modality } from "./processors/types.js";
import { getProcessorByMimeType } from "./processors/registry.js";
import { getProvider } from "./providers/registry.js";
import { formatResult } from "./output/formatter.js";
import type { PipelineResult } from "./output/types.js";
import { logger } from "./logger.js";

// Ensure all processors and providers are registered
import "./processors/index.js";
import "./providers/index.js";

const SYSTEM_PROMPTS: Record<Modality, string> = {
  image: `You are a vision analysis system. Analyze the provided image and return a JSON object with the following structure:
{
  "description": "detailed description of the image",
  "labels": [{"name": "label", "confidence": 0.95}],
  "objects": [{"x": 0, "y": 0, "width": 100, "height": 100, "label": "object"}],
  "text": "any text detected in the image",
  "sentiment": "positive|negative|neutral",
  "colors": ["#hex1", "#hex2"]
}
Return ONLY valid JSON, no markdown fences or extra text.`,

  audio: `You are an audio analysis system. Analyze the provided transcription and return a JSON object with the following structure:
{
  "transcription": "the full transcription",
  "summary": "a concise summary of the content",
  "language": "detected language",
  "topics": ["topic1", "topic2"],
  "sentiment": "positive|negative|neutral",
  "speakers": 1
}
Return ONLY valid JSON, no markdown fences or extra text.`,

  video: `You are a video analysis system. Analyze the provided video frames in sequence and return a JSON object with the following structure:
{
  "description": "overall description of the video content",
  "scenes": [{"timestamp": "0:00", "description": "scene description"}],
  "labels": [{"name": "label", "confidence": 0.95}],
  "summary": "a concise summary of the video"
}
Return ONLY valid JSON, no markdown fences or extra text.`,
};

/**
 * Detect the modality of a file from its MIME type.
 */
export function detectModality(mimeType: string): Modality {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  throw new Error(`Unsupported MIME type: ${mimeType}`);
}

/**
 * Process a single file through the multimodal pipeline.
 *
 * Steps:
 * 1. Detect MIME type from file extension
 * 2. Determine modality (image, audio, video)
 * 3. Route to the appropriate processor
 * 4. Send processed content to LLM for analysis
 * 5. Validate and format the structured output
 */
export async function processFile(filePath: string, config: Config): Promise<PipelineResult> {
  // Verify the file exists
  await stat(filePath);

  // Detect MIME type
  const ext = extname(filePath).toLowerCase();
  const mimeType = lookup(ext) || "application/octet-stream";

  logger.info("Detected file type", { filePath, mimeType, ext });

  // Determine modality
  const modality = detectModality(mimeType);
  logger.info("Detected modality", { modality });

  // Get the processor for this MIME type
  const processor = getProcessorByMimeType(mimeType);
  logger.info("Processing input", { processor: processor.modality });

  // Process the file
  const processed: ProcessedInput = await processor.process(filePath, mimeType);

  // Get the LLM provider
  const provider = getProvider(config.llm.provider);
  logger.info("Analyzing with LLM", { provider: config.llm.provider, model: config.llm.model });

  // Route to the appropriate analysis method
  const systemPrompt = SYSTEM_PROMPTS[modality];
  let analysisResult;

  if (modality === "video" && processed.frames?.length) {
    analysisResult = await provider.analyzeFrames(
      processed.frames,
      systemPrompt,
      config.llm.model,
      config.llm.temperature,
      config.llm.maxTokens,
    );
  } else {
    analysisResult = await provider.analyze(
      processed,
      systemPrompt,
      config.llm.model,
      config.llm.temperature,
      config.llm.maxTokens,
    );
  }

  // Format and validate the output
  const result = formatResult(filePath, modality, mimeType, analysisResult);

  logger.info("Pipeline complete", {
    source: filePath,
    modality,
    model: result.model,
    usage: result.usage,
  });

  return result;
}
