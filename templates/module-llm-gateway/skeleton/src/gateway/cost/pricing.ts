// ── Default Pricing Table ───────────────────────────────────────────
//
// Per-model pricing in USD per 1M tokens. These are defaults that
// can be overridden by provider pricing. Kept as a reference for
// cost estimation when provider-reported usage is unavailable.
//
// Rates are each vendor's published list price for the direct API, not a
// cloud reseller's — Bedrock and Vertex price the same models differently.
// Check the vendor's pricing page when adding a model rather than copying a
// neighbouring row: tiers within one family do not share a ratio, and a
// promotional rate is not the rate to store.
//

export interface ModelPricing {
  /** Cost per 1M input tokens in USD. */
  input: number;
  /** Cost per 1M output tokens in USD. */
  output: number;
}

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },

  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },

  // Groq (Llama 3)
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
};

/**
 * The DEFAULT_PRICING key a model id prices under: the id without its
 * inference-profile geo and provider prefixes (`us.anthropic.`), its version
 * suffix (`-v1:0`) and its snapshot date (`-20251001`). A Bedrock
 * inference-profile ID and the vendor's alias for the same model share one
 * key: `us.anthropic.claude-haiku-4-5-20251001-v1:0` and `claude-haiku-4-5`
 * are both `claude-haiku-4-5`.
 */
export function pricingKey(model: string): string {
  return model
    .replace(/:\d+$/, "")
    .replace(/^(?:[a-z]+\.)+/, "")
    .replace(/-v\d+$/, "")
    .replace(/-\d{8}$/, "");
}

/** Pricing for a model id the table lists, and undefined for one it does not. */
export function findModelPricing(model: string): ModelPricing | undefined {
  return DEFAULT_PRICING[model] ?? DEFAULT_PRICING[pricingKey(model)];
}

/**
 * Look up pricing for a model id. Falls back to a zero-cost default
 * if the model is not in the pricing table.
 */
export function getModelPricing(model: string): ModelPricing {
  return findModelPricing(model) ?? { input: 0, output: 0 };
}

/**
 * Calculate cost for a request given token counts and model.
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);
  return (inputTokens * pricing.input) / 1_000_000 + (outputTokens * pricing.output) / 1_000_000;
}
