// ── LLM Provider Core Types ────────────────────────────────────────
//
// Shared interfaces for the LLM provider pack. These are the canonical
// types that every provider, adapter, and consumer works against.
// Provider-agnostic — implementations map their native formats into
// these common shapes.
//

/** A single message in a conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options passed to provider.chat() and provider.streamChat(). */
export interface ChatOptions {
  /** Override the model for this request. */
  model?: string;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /**
   * Temperature for sampling (0-2). Whether a request carries it is the
   * provider's decision: a provider that can send something other than the
   * caller's value declares what it sends through its `sampling` hook, and
   * one without the hook sends the caller's value when it is set and its
   * own default otherwise. Each provider's module header gives its rule.
   */
  temperature?: number;
  /** Top-p nucleus sampling. A provider decides whether to send it as it does `temperature`. */
  topP?: number;
  /** Stop sequences. */
  stop?: string[];
  /** Additional provider-specific parameters. */
  params?: Record<string, unknown>;
}

/** Token usage returned by the provider, when available. */
export interface TokenUsage {
  /** Input (prompt) tokens consumed. */
  inputTokens: number;
  /** Output (completion) tokens generated. */
  outputTokens: number;
  /** Cached input tokens read from a prompt-cache hit, when reported. */
  cacheReadTokens?: number;
  /** Input tokens written to the prompt cache, when reported. */
  cacheWriteTokens?: number;
}

/** Pricing per 1M tokens in USD. */
export interface Pricing {
  /** Cost per 1M input tokens in USD. */
  input: number;
  /** Cost per 1M output tokens in USD. */
  output: number;
}

/** Response from a provider.chat() call. */
export interface LlmResponse {
  /** The generated text. */
  text: string;
  /** Model that produced the response. */
  model: string;
  /** Provider that handled the request. */
  provider: string;
  /** Token usage for this request. */
  usage: TokenUsage;
  /** Request latency in milliseconds. */
  latencyMs: number;
  /** Cost in USD for this request (estimated from pricing table). */
  cost: number;
}

/** A single chunk from a streaming response. */
export interface StreamChunk {
  /** Text delta in this chunk. */
  text: string;
  /** Whether this is the final chunk. */
  done: boolean;
}

/** Streaming chat response. Yields StreamChunk values as they arrive. */
export interface StreamResponse extends AsyncIterable<StreamChunk> {
  /**
   * Resolves to the complete LlmResponse after the stream finishes.
   * Contains aggregated text, token usage, and cost.
   */
  response: Promise<LlmResponse>;
}

/**
 * Default pricing per 1M tokens for known models. Every built-in provider
 * that calls a model reaches it through Bedrock, directly or through the
 * Platform's ModelGateway, so a row is the model's Bedrock on-demand list
 * price.
 */
export const DEFAULT_PRICING: Record<string, Pricing> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
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

/** The pricing DEFAULT_PRICING lists for a model id, and undefined for a model it does not list. */
export function findPricing(model: string): Pricing | undefined {
  return DEFAULT_PRICING[model] ?? DEFAULT_PRICING[pricingKey(model)];
}

/** Look up pricing for a model id, falling back to zero for a model the table does not list. */
export function getPricing(model: string): Pricing {
  return findPricing(model) ?? { input: 0, output: 0 };
}

/** Estimate cost in USD from token usage and pricing. */
export function estimateCost(usage: TokenUsage, pricing: Pricing): number {
  return (
    (usage.inputTokens * pricing.input) / 1_000_000 +
    (usage.outputTokens * pricing.output) / 1_000_000
  );
}
