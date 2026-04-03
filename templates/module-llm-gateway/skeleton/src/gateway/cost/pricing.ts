// ── Default Pricing Table ───────────────────────────────────────────
//
// Per-model pricing in USD per 1M tokens. These are defaults that
// can be overridden by provider pricing. Kept as a reference for
// cost estimation when provider-reported usage is unavailable.
//

export interface ModelPricing {
  /** Cost per 1M input tokens in USD. */
  input: number;
  /** Cost per 1M output tokens in USD. */
  output: number;
}

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-4-20250514": { input: 0.8, output: 4 },
  "claude-opus-4-20250514": { input: 15, output: 75 },

  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },

  // Groq (Llama 3)
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
};

/**
 * Look up pricing for a model. Falls back to a zero-cost default
 * if the model is not in the pricing table.
 */
export function getModelPricing(model: string): ModelPricing {
  return DEFAULT_PRICING[model] ?? { input: 0, output: 0 };
}

/**
 * Calculate cost for a request given token counts and model.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model);
  return (inputTokens * pricing.input) / 1_000_000 + (outputTokens * pricing.output) / 1_000_000;
}
