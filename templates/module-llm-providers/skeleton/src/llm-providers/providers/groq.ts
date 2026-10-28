import Groq, { type ClientOptions } from "groq-sdk";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_MAX_RETRIES, REQUEST_TIMEOUT_MS } from "../resilience/request-timeout.js";
import { guardStream } from "../resilience/stream-guard.js";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, LlmResponse, Pricing, StreamResponse } from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Groq Provider ──────────────────────────────────────────────────
//
// Llama 3 / Mixtral via the groq-sdk. createGroqProvider() returns an
// instance with its own lazily-initialized SDK client and circuit
// breaker; the registered `groq` factory returns one such instance for
// the life of the process. Supports both request/response and streaming
// modes, and runs both through the circuit breaker. A request gives each
// attempt LLM_REQUEST_TIMEOUT_MS (120s by default) and retries a
// timed-out attempt once; a stream fails when no event arrives for that
// long. `requestTimeoutMs` sets the timeout per instance, and
// resilience/request-timeout.ts gives the bound it puts on each mode.
//
// Sends the caller's `temperature`, and 1 when the caller sets none, and
// the caller's `topP` when one is set.
//
// Auth: GROQ_API_KEY environment variable (read by the SDK).
//

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export interface GroqProviderOptions {
  /**
   * How long a call waits on the model, in milliseconds: each attempt of a
   * request, and each wait for a stream's next event. LLM_REQUEST_TIMEOUT_MS
   * when unset; a `timeout` in `client` takes its place.
   */
  requestTimeoutMs?: number;
  /**
   * SDK client options: credentials (GROQ_API_KEY when unset), base URL,
   * timeout, maxRetries (REQUEST_MAX_RETRIES when unset), or the `fetch`
   * requests go through.
   */
  client?: ClientOptions;
}

/**
 * A Groq provider instance with its own SDK client and circuit breaker.
 * The registered `groq` provider is one of these, built with no options.
 */
export function createGroqProvider(options: GroqProviderOptions = {}): LlmProvider {
  const requestTimeoutMs =
    options.client?.timeout ?? options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let client: Groq | null = null;
  const cb = createCircuitBreaker();

  function getClient(): Groq {
    if (!client) {
      client = new Groq({
        timeout: requestTimeoutMs,
        maxRetries: REQUEST_MAX_RETRIES,
        ...options.client,
      });
    }
    return client;
  }

  const pricing: Pricing = getPricing(DEFAULT_MODEL);

  return {
    name: "groq",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
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
          ...(opts?.topP !== undefined ? { top_p: opts.topP } : {}),
          ...(opts?.stop ? { stop: opts.stop } : {}),
        }),
      );

      const latencyMs = performance.now() - start;
      const usage = {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
      const text = response.choices[0]?.message?.content ?? "";

      const modelPricing = getPricing(model);
      const cost = estimateCost(usage, modelPricing);

      logger.debug("groq chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "groq", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      return guardStream(cb, requestTimeoutMs, {
        open: (signal: AbortSignal) =>
          getClient().chat.completions.create(
            {
              model,
              max_tokens: maxTokens,
              temperature,
              stream: true,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              ...(opts?.topP !== undefined ? { top_p: opts.topP } : {}),
              ...(opts?.stop ? { stop: opts.stop } : {}),
            },
            { signal },
          ),
        text: (chunk) => chunk.choices[0]?.delta?.content ?? undefined,
        finish(text, latencyMs) {
          const usage = {
            inputTokens: countTokens(messages.map((m) => m.content).join(" "), model),
            outputTokens: countTokens(text, model),
          };
          const cost = estimateCost(usage, getPricing(model));
          return { text, model, provider: "groq", usage, latencyMs, cost };
        },
      });
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker holds across requests.
const groqProvider = createGroqProvider();
registerProvider("groq", () => groqProvider);
