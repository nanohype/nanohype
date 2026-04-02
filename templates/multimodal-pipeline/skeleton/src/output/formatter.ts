/**
 * Output formatter and validator.
 *
 * Takes raw LLM analysis text, attempts to parse it as JSON, and
 * validates it against the appropriate Zod schema for the modality.
 * Falls back to a minimal structured result if the LLM output is
 * not valid JSON.
 */

import type { Modality } from "../processors/types.js";
import type { AnalysisResult } from "../providers/types.js";
import {
  imageAnalysisSchema,
  audioAnalysisSchema,
  videoAnalysisSchema,
  pipelineResultSchema,
} from "./types.js";
import type { PipelineResult, ImageAnalysis, AudioAnalysis, VideoAnalysis } from "./types.js";
import { logger } from "../logger.js";

function parseAnalysis(
  raw: string,
  modality: Modality,
): ImageAnalysis | AudioAnalysis | VideoAnalysis {
  // Try to extract JSON from the LLM response (may be wrapped in markdown code fences)
  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);

    switch (modality) {
      case "image":
        return imageAnalysisSchema.parse(parsed);
      case "audio":
        return audioAnalysisSchema.parse(parsed);
      case "video":
        return videoAnalysisSchema.parse(parsed);
    }
  } catch (err) {
    logger.warn("Failed to parse structured output from LLM, using fallback", {
      modality,
      error: String(err),
    });

    // Fallback: wrap the raw text in a minimal valid structure
    switch (modality) {
      case "image":
        return { description: raw, labels: [] };
      case "audio":
        return { transcription: "", summary: raw };
      case "video":
        return { description: raw, scenes: [], summary: raw };
    }
  }
}

export function formatResult(
  source: string,
  modality: Modality,
  mimeType: string,
  analysisResult: AnalysisResult,
): PipelineResult {
  const analysis = parseAnalysis(analysisResult.content, modality);

  const result = pipelineResultSchema.parse({
    source,
    modality,
    mimeType,
    analysis,
    raw: analysisResult.content,
    model: analysisResult.model,
    usage: analysisResult.usage,
    processedAt: new Date().toISOString(),
  });

  return result;
}
