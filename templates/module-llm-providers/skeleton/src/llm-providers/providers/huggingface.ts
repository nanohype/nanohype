import { HfInference, type Options } from "@huggingface/inference";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_TIMEOUT_MS, withRequestTimeout } from "../resilience/request-timeout.js";
import { guardStream } from "../resilience/stream-guard.js";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, LlmResponse, Pricing, StreamResponse } from "../types.js";
import { estimateCost } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Hugging Face Provider ──────────────────────────────────────────
//
// Text generation via @huggingface/inference. Uses the Inference API
// for hosted models. createHuggingFaceProvider() returns an instance
// with its own client and circuit breaker; the registered `huggingface`
// factory returns one such instance for the life of the process.
// Supports both request/response and streaming modes, and runs both
// through the circuit breaker under LLM_REQUEST_TIMEOUT_MS (120s by
// default; `requestTimeoutMs` sets it per instance): a request fails when
// its reply takes longer, the SDK's retries of a request answered 503
// included, and a stream when no event arrives for that long. Either way
// the request's abort signal fires, which drops the connection.
// resilience/request-timeout.ts gives the bound it puts on each mode.
//
// Sends the caller's `temperature`, and 1 when the caller sets none, and
// the caller's `topP` when one is set.
//
// Auth: HF_TOKEN environment variable.
//

const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

export interface HuggingFaceProviderOptions {
  /** The access token requests carry. HF_TOKEN when unset. */
  accessToken?: string;
  /**
   * How long a call waits on the model, in milliseconds: a whole request,
   * or each wait for a stream's next event. LLM_REQUEST_TIMEOUT_MS when unset.
   */
  requestTimeoutMs?: number;
  /** SDK options every request takes, such as the `fetch` requests go through. */
  client?: Options;
}

/**
 * A Hugging Face provider instance with its own client and circuit breaker.
 * The registered `huggingface` provider is one of these, built with no
 * options.
 */
export function createHuggingFaceProvider(options: HuggingFaceProviderOptions = {}): LlmProvider {
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let client: HfInference | null = null;
  const cb = createCircuitBreaker();

  function getClient(): HfInference {
    if (!client) {
      client = new HfInference(options.accessToken ?? process.env.HF_TOKEN, options.client);
    }
    return client;
  }

  const pricing: Pricing = { input: 0, output: 0 };

  return {
    name: "huggingface",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      const start = performance.now();

      const response = await cb.execute(() =>
        withRequestTimeout(requestTimeoutMs, (signal) =>
          getClient().chatCompletion(
            {
              model,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              max_tokens: maxTokens,
              temperature,
              ...(opts?.topP !== undefined ? { top_p: opts.topP } : {}),
              ...(opts?.stop ? { stop: opts.stop } : {}),
            },
            { signal },
          ),
        ),
      );

      const latencyMs = performance.now() - start;
      const text = response.choices[0]?.message?.content ?? "";
      const usage = {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
      const cost = estimateCost(usage, pricing);

      logger.debug("huggingface chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "huggingface", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      return guardStream(cb, requestTimeoutMs, {
        open: (signal: AbortSignal) =>
          getClient().chatCompletionStream(
            {
              model,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              max_tokens: maxTokens,
              temperature,
              ...(opts?.topP !== undefined ? { top_p: opts.topP } : {}),
              ...(opts?.stop ? { stop: opts.stop } : {}),
            },
            { signal },
          ),
        text: (chunk) => chunk.choices[0]?.delta?.content,
        finish(text, latencyMs) {
          const usage = {
            inputTokens: countTokens(messages.map((m) => m.content).join(" ")),
            outputTokens: countTokens(text),
          };
          const cost = estimateCost(usage, pricing);
          return { text, model, provider: "huggingface", usage, latencyMs, cost };
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
const huggingFaceProvider = createHuggingFaceProvider();
registerProvider("huggingface", () => huggingFaceProvider);
