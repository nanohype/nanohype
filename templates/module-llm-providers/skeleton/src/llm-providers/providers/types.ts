// ── LLM Provider Interface (Canonical) ─────────────────────────────
//
// Every LLM provider implements this interface. The registry stores
// provider factories — each call to getProvider() returns a fresh
// instance with its own circuit breaker and SDK client state.
//
// No module-level mutable state: SDK clients are lazily initialized
// inside each factory closure, and circuit breakers are per-instance.
//

import type { ChatMessage, ChatOptions, LlmResponse, StreamResponse, Pricing } from "../types.js";

/** Provider factory — returns a new LlmProvider instance each time. */
export type LlmProviderFactory = () => LlmProvider;

export interface LlmProvider {
  /** Unique provider name (e.g. "anthropic", "openai", "groq"). */
  readonly name: string;

  /** Send a chat request and return a unified response. */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse>;

  /** Stream a chat request, yielding chunks as they arrive. */
  streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse;

  /** Count tokens in a text string (approximate). */
  countTokens(text: string, model?: string): number;

  /** Pricing per 1M tokens for cost tracking. */
  readonly pricing: Pricing;
}
