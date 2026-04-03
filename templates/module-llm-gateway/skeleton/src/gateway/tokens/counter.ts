// ── Token Counter ───────────────────────────────────────────────────
//
// Token counting via js-tiktoken using the cl100k_base encoding.
// Caches the encoder instance for reuse across calls. Provides
// a simple count function suitable for cost estimation and quota
// enforcement.
//

import { encodingForModel, type TiktokenModel } from "js-tiktoken";

// Cache encoders by model to avoid repeated initialization
const encoderCache = new Map<string, ReturnType<typeof encodingForModel>>();

// Models that use cl100k_base encoding
const CL100K_MODELS = new Set([
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
]);

function getEncoder(model?: string): ReturnType<typeof encodingForModel> {
  // Default to cl100k_base via gpt-4o if model is unknown
  const effectiveModel = model && CL100K_MODELS.has(model) ? model : "gpt-4o";
  const cacheKey = effectiveModel;

  let encoder = encoderCache.get(cacheKey);
  if (!encoder) {
    encoder = encodingForModel(effectiveModel as TiktokenModel);
    encoderCache.set(cacheKey, encoder);
  }
  return encoder;
}

/**
 * Count the number of tokens in a text string.
 *
 * Uses the cl100k_base encoding (shared by GPT-4o and approximates
 * well for Claude models). The encoder is cached for performance.
 *
 * @param text - The text to count tokens for.
 * @param model - Optional model name for model-specific encoding.
 * @returns The number of tokens.
 */
export function countTokens(text: string, model?: string): number {
  const encoder = getEncoder(model);
  return encoder.encode(text).length;
}
