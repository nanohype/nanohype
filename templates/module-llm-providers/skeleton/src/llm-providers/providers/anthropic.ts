import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_MAX_RETRIES, REQUEST_TIMEOUT_MS } from "../resilience/request-timeout.js";
import { guardStream } from "../resilience/stream-guard.js";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, LlmResponse, Pricing, StreamResponse } from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Anthropic Provider ─────────────────────────────────────────────
//
// Claude via the @anthropic-ai/sdk. createAnthropicProvider() returns an
// instance with its own lazily-initialized SDK client and circuit
// breaker; the registered `anthropic` factory returns one such instance
// for the life of the process. Supports both request/response and
// streaming modes, and runs both through the circuit breaker. A request
// gives each attempt LLM_REQUEST_TIMEOUT_MS (120s by default) and retries
// a timed-out attempt once; a stream fails when no event arrives for that
// long. `requestTimeoutMs` sets the timeout per instance, and
// resilience/request-timeout.ts gives the bound it puts on each mode.
//
// Auth: ANTHROPIC_API_KEY environment variable (read by the SDK).
//
// The Messages API rejects `temperature`, `top_p` and `top_k` at any
// value, the default included, so neither request mode sends them
// whatever `opts.temperature` and `opts.topP` hold. An instance logs the
// first request that sets one, once, at debug level. Claude on Bedrock
// follows a different rule, which the README's Sampling parameters
// section gives.
//

const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * The sampling options a Messages API request carries for `opts`: none.
 * Both request modes build their body from this, and it is the provider's
 * `sampling` hook.
 */
function samplingFor(_opts?: ChatOptions): Pick<ChatOptions, "temperature"> {
  return {};
}

export interface AnthropicProviderOptions {
  /**
   * How long a call waits on the model, in milliseconds: each attempt of a
   * request, and each wait for a stream's next event. LLM_REQUEST_TIMEOUT_MS
   * when unset; a `timeout` in `client` takes its place.
   */
  requestTimeoutMs?: number;
  /**
   * SDK client options: credentials (ANTHROPIC_API_KEY when unset), base URL,
   * timeout, maxRetries (REQUEST_MAX_RETRIES when unset), or the `fetch`
   * requests go through.
   */
  client?: ClientOptions;
}

/**
 * An Anthropic provider instance with its own SDK client and circuit
 * breaker. The registered `anthropic` provider is one of these, built with
 * no options.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): LlmProvider {
  const requestTimeoutMs =
    options.client?.timeout ?? options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let client: Anthropic | null = null;
  const cb = createCircuitBreaker();

  function getClient(): Anthropic {
    if (!client) {
      client = new Anthropic({
        timeout: requestTimeoutMs,
        maxRetries: REQUEST_MAX_RETRIES,
        ...options.client,
      });
    }
    return client;
  }

  const pricing: Pricing = getPricing(DEFAULT_MODEL);

  let droppedSamplingLogged = false;
  function noteDroppedSampling(opts?: ChatOptions): void {
    if (droppedSamplingLogged) return;
    if (opts?.temperature === undefined && opts?.topP === undefined) return;
    droppedSamplingLogged = true;
    logger.debug("anthropic sends no sampling options", {
      temperature: opts.temperature,
      topP: opts.topP,
    });
  }

  return {
    name: "anthropic",
    pricing,
    sampling: samplingFor,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      noteDroppedSampling(opts);

      const systemParts = messages.filter((m) => m.role === "system");
      const conversationParts = messages.filter((m) => m.role !== "system");
      const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

      const start = performance.now();

      const response = await cb.execute(() =>
        getClient().messages.create({
          model,
          max_tokens: maxTokens,
          ...samplingFor(opts),
          system: systemPrompt || undefined,
          messages: conversationParts.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          ...(opts?.stop ? { stop_sequences: opts.stop } : {}),
        }),
      );

      const latencyMs = performance.now() - start;
      const usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      };

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => ("text" in block ? block.text : ""))
        .join("");

      const modelPricing = getPricing(model);
      const cost = estimateCost(usage, modelPricing);

      logger.debug("anthropic chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "anthropic", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      noteDroppedSampling(opts);

      const systemParts = messages.filter((m) => m.role === "system");
      const conversationParts = messages.filter((m) => m.role !== "system");
      const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

      let finalMessage: (() => Promise<Anthropic.Message>) | undefined;
      return guardStream(cb, requestTimeoutMs, {
        open(signal: AbortSignal) {
          const stream = getClient().messages.stream(
            {
              model,
              max_tokens: maxTokens,
              ...samplingFor(opts),
              system: systemPrompt || undefined,
              messages: conversationParts.map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
              ...(opts?.stop ? { stop_sequences: opts.stop } : {}),
            },
            { signal },
          );
          finalMessage = () => stream.finalMessage();
          return stream;
        },
        text: (event) =>
          event.type === "content_block_delta" && event.delta.type === "text_delta"
            ? event.delta.text
            : undefined,
        async finish(text, latencyMs) {
          const message = await finalMessage?.();
          const usage = {
            inputTokens: message?.usage?.input_tokens ?? 0,
            outputTokens: message?.usage?.output_tokens ?? 0,
          };
          const cost = estimateCost(usage, getPricing(model));
          return { text, model, provider: "anthropic", usage, latencyMs, cost };
        },
      });
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker and log-once state hold across requests.
const anthropicProvider = createAnthropicProvider();
registerProvider("anthropic", () => anthropicProvider);
