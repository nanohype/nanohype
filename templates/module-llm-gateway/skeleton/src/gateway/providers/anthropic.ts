import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, GatewayResponse } from "../types.js";
import { createCircuitBreaker } from "./circuit-breaker.js";
import { registerProvider } from "./registry.js";
import { REQUEST_MAX_RETRIES, REQUEST_TIMEOUT_MS } from "./request-timeout.js";
import type { GatewayProvider, ProviderPricing } from "./types.js";

// ── Anthropic Provider ──────────────────────────────────────────────
//
// Claude Sonnet via the @anthropic-ai/sdk. Wraps API calls in a
// circuit breaker for fault isolation. Maps Anthropic-native
// responses into the unified GatewayResponse shape. The client applies
// LLM_REQUEST_TIMEOUT_MS (30s by default) to each attempt and retries a
// timed-out attempt once, unless the caller's client options set `timeout`
// or `maxRetries`; request-timeout.ts gives the bound that makes.
//
// The Messages API rejects `temperature`, `top_p` and `top_k` at any
// value, the default included, so this provider sends none whatever
// `opts.temperature` holds, and does not log the drop: the gateway
// carries no logger. The Bedrock provider applies its own rule to Claude
// model ids; bedrock.ts gives it.
//

const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * The sampling options a Messages API request carries for `opts`: none.
 * The request body and the `sampling` hook both read this.
 */
function samplingFor(_opts: ChatOptions): Pick<ChatOptions, "temperature"> {
  return {};
}

export interface AnthropicProviderOptions {
  /**
   * SDK client options: credentials (ANTHROPIC_API_KEY when unset), base URL,
   * timeout (LLM_REQUEST_TIMEOUT_MS when unset), maxRetries
   * (REQUEST_MAX_RETRIES when unset), or the `fetch` requests go through.
   */
  client?: ClientOptions;
}

/**
 * An Anthropic provider with its own SDK client and circuit breaker. The
 * registered `anthropic` provider is one of these, built with no options.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): GatewayProvider {
  let client: Anthropic | null = null;
  function getClient(): Anthropic {
    if (!client) {
      client = new Anthropic({
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: REQUEST_MAX_RETRIES,
        ...options.client,
      });
    }
    return client;
  }

  const cb = createCircuitBreaker();

  return {
    name: "anthropic",

    pricing: {
      input: 3,
      output: 15,
    } satisfies ProviderPricing,

    sampling: samplingFor,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;

      // Separate system messages from conversation
      const systemParts = messages.filter((m) => m.role === "system");
      const conversationParts = messages.filter((m) => m.role !== "system");
      const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

      const start = performance.now();

      const response = await cb.execute(() =>
        getClient().messages.create({
          model,
          max_tokens: maxTokens,
          ...samplingFor(opts ?? {}),
          system: systemPrompt || undefined,
          messages: conversationParts.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        }),
      );

      const latencyMs = performance.now() - start;
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => ("text" in block ? block.text : ""))
        .join("");

      const cost =
        (inputTokens * this.pricing.input) / 1_000_000 +
        (outputTokens * this.pricing.output) / 1_000_000;

      return {
        text,
        model,
        provider: this.name,
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

// Self-register. The registry returns this one instance for every lookup.
const anthropicProvider = createAnthropicProvider();
registerProvider("anthropic", () => anthropicProvider);
