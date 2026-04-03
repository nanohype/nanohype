// ── Gateway Adapter ─────────────────────────────────────────────────
//
// Wraps an LlmProvider into the GatewayProvider shape using structural
// typing. No import from the gateway module — the adapter produces an
// object that satisfies the GatewayProvider interface via duck typing.
//
// This allows the llm-providers module to feed into module-llm-gateway
// without creating a compile-time dependency between the two.
//

import type { LlmProvider } from "../providers/types.js";
import type { ChatMessage, ChatOptions, Pricing } from "../types.js";

/** Structural equivalent of GatewayProvider from module-llm-gateway. */
export interface GatewayProviderShape {
  readonly name: string;
  chat(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    opts?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      provider?: string;
      tags?: Record<string, string>;
      cacheTtl?: number;
      params?: Record<string, unknown>;
    },
  ): Promise<{
    text: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cached: boolean;
    cost: number;
  }>;
  countTokens(text: string): number;
  readonly pricing: { input: number; output: number };
}

/**
 * Create a gateway-compatible adapter from an LlmProvider.
 *
 * The returned object structurally matches GatewayProvider from
 * module-llm-gateway. No import from the gateway module is needed.
 */
export function createGatewayAdapter(provider: LlmProvider): GatewayProviderShape {
  return {
    name: provider.name,
    pricing: provider.pricing,

    async chat(
      messages: ChatMessage[],
      opts?: ChatOptions & {
        provider?: string;
        tags?: Record<string, string>;
        cacheTtl?: number;
      },
    ) {
      const response = await provider.chat(messages, opts);
      return {
        text: response.text,
        model: response.model,
        provider: response.provider,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        latencyMs: response.latencyMs,
        cached: false,
        cost: response.cost,
      };
    },

    countTokens(text: string): number {
      return provider.countTokens(text);
    },
  };
}
