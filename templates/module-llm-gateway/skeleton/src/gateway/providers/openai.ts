import OpenAI, { type ClientOptions } from "openai";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, GatewayResponse } from "../types.js";
import { createCircuitBreaker } from "./circuit-breaker.js";
import { registerProvider } from "./registry.js";
import { REQUEST_MAX_RETRIES, REQUEST_TIMEOUT_MS } from "./request-timeout.js";
import type { GatewayProvider, ProviderPricing } from "./types.js";

// ── OpenAI Provider ─────────────────────────────────────────────────
//
// GPT-4o via the openai SDK. Wraps API calls in a circuit breaker
// for fault isolation. Maps chat completion responses into the unified
// GatewayResponse shape. The client applies LLM_REQUEST_TIMEOUT_MS (30s by
// default) to each attempt and retries a timed-out attempt once, unless
// the caller's client options set `timeout` or `maxRetries`;
// request-timeout.ts gives the bound that makes.
//
// Sends the caller's `temperature`, and 1 when the caller sets none.
//

const DEFAULT_MODEL = "gpt-4o";

const PRICING = {
  input: 2.5,
  output: 10,
} satisfies ProviderPricing;

export interface OpenAIProviderOptions {
  /**
   * SDK client options: credentials (OPENAI_API_KEY when unset), base URL,
   * timeout (LLM_REQUEST_TIMEOUT_MS when unset), maxRetries
   * (REQUEST_MAX_RETRIES when unset), or the `fetch` requests go through.
   */
  client?: ClientOptions;
}

/**
 * An OpenAI provider with its own SDK client and circuit breaker. The
 * registered `openai` provider is one of these, built with no options.
 */
export function createOpenAIProvider(options: OpenAIProviderOptions = {}): GatewayProvider {
  let client: OpenAI | null = null;
  function getClient(): OpenAI {
    if (!client) {
      client = new OpenAI({
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: REQUEST_MAX_RETRIES,
        ...options.client,
      });
    }
    return client;
  }

  const cb = createCircuitBreaker();

  return {
    name: "openai",

    pricing: PRICING,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      const start = performance.now();

      const response = await cb.execute(() =>
        getClient().chat.completions.create({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      );

      const latencyMs = performance.now() - start;
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const text = response.choices[0]?.message?.content ?? "";

      const cost =
        (inputTokens * PRICING.input) / 1_000_000 + (outputTokens * PRICING.output) / 1_000_000;

      return {
        text,
        model,
        provider: "openai",
        inputTokens,
        outputTokens,
        latencyMs,
        cached: false,
        cost,
      };
    },

    countTokens(text: string): number {
      return countTokens(text);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker holds across requests.
const openaiProvider = createOpenAIProvider();
registerProvider("openai", () => openaiProvider);
