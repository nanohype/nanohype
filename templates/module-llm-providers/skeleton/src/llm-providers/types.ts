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
  /** Temperature for sampling (0-2). */
  temperature?: number;
  /** Top-p nucleus sampling. */
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

/** Default pricing per 1M tokens for known models. */
export const DEFAULT_PRICING: Record<string, Pricing> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o3": { input: 2, output: 8 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
};

/** Look up pricing for a model, falling back to zero. */
export function getPricing(model: string): Pricing {
  return DEFAULT_PRICING[model] ?? { input: 0, output: 0 };
}

/** Estimate cost in USD from token usage and pricing. */
export function estimateCost(usage: TokenUsage, pricing: Pricing): number {
  return (
    (usage.inputTokens * pricing.input) / 1_000_000 +
    (usage.outputTokens * pricing.output) / 1_000_000
  );
}
