// ── Gateway Provider Interface ──────────────────────────────────────
//
// All LLM providers implement this interface. The registry pattern
// allows new providers to be added by importing a provider module
// that calls registerProvider() at the module level.
//

import type { ChatMessage, GatewayResponse, ChatOptions } from "../types.js";

/** Pricing per 1M tokens in USD. */
export interface ProviderPricing {
  /** Cost per 1M input tokens in USD. */
  input: number;
  /** Cost per 1M output tokens in USD. */
  output: number;
}

export interface GatewayProvider {
  /** Unique provider name (e.g. "anthropic", "openai", "groq"). */
  readonly name: string;

  /** Send a chat request and return a unified response. */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse>;

  /** Count tokens in a text string (approximate). */
  countTokens(text: string): number;

  /** Pricing per 1M tokens for cost tracking. */
  readonly pricing: ProviderPricing;
}
