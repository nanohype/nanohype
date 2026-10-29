// ── LLM Provider Interface (Canonical) ─────────────────────────────
//
// Every LLM provider implements this interface. The registry stores
// provider factories, and getProvider() returns what the factory
// registered under a name returns.
//
// State lives on the instance: its SDK client is lazily initialized
// inside its closure, and its circuit breaker is its own.
//

import type { ChatMessage, ChatOptions, LlmResponse, Pricing, StreamResponse } from "../types.js";

/** Provider factory — getProvider() calls it on every lookup. */
export type LlmProviderFactory = () => LlmProvider;

export interface LlmProvider {
  /** Unique provider name (e.g. "gateway", "bedrock", "mock"). */
  readonly name: string;

  /** Send a chat request and return a unified response. */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse>;

  /** Stream a chat request, yielding chunks as they arrive. */
  streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse;

  /** Count tokens in a text string (approximate). */
  countTokens(text: string, model?: string): number;

  /** Pricing per 1M tokens for cost tracking. */
  readonly pricing: Pricing;

  /**
   * The sampling options the request for `opts` carries. Build it from the
   * same function as the request, so the two cannot disagree. The gateway
   * adapter hands it to module-llm-gateway, which keys its response cache on
   * it. A provider without it sends the caller's `temperature` and `topP`
   * when they are set, and its own default `temperature` otherwise.
   */
  sampling?(opts: ChatOptions): Pick<ChatOptions, "temperature" | "topP">;
}
