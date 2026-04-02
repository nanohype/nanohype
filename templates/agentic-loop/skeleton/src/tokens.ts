import { encodingForModel, type TiktokenModel } from "js-tiktoken";

/**
 * Cached encodings keyed by model name. Creating an encoding is expensive
 * (parses a ~3 MB BPE rank file), so we reuse instances across calls.
 */
const encodingCache = new Map<string, ReturnType<typeof encodingForModel>>();

/**
 * Default encoding model. cl100k_base covers Claude, GPT-4, and GPT-3.5-turbo.
 */
const DEFAULT_MODEL: TiktokenModel = "gpt-4o";

/**
 * Get or create a tiktoken encoding for the given model.
 */
function getEncoding(model: TiktokenModel): ReturnType<typeof encodingForModel> {
  let enc = encodingCache.get(model);
  if (!enc) {
    enc = encodingForModel(model);
    encodingCache.set(model, enc);
  }
  return enc;
}

/**
 * Count the number of tokens in a string using tiktoken's BPE tokenizer.
 *
 * Uses cl100k_base encoding by default (via the gpt-4o model mapping),
 * which produces accurate counts for Claude and GPT-4 family models.
 * Falls back to a char/4 heuristic only if tiktoken throws (e.g.
 * unrecognised model name).
 */
export function countTokens(text: string, model?: string): number {
  try {
    const enc = getEncoding((model ?? DEFAULT_MODEL) as TiktokenModel);
    return enc.encode(text).length;
  } catch {
    // Graceful fallback if the model name is not supported
    return Math.ceil(text.length / 4);
  }
}
