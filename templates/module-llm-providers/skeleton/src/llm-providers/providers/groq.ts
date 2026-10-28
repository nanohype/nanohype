import Groq, { type ClientOptions } from "groq-sdk";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_MAX_RETRIES, REQUEST_TIMEOUT_MS } from "../resilience/request-timeout.js";
import { countTokens } from "../tokens/counter.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  Pricing,
  StreamChunk,
  StreamResponse,
} from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Groq Provider ──────────────────────────────────────────────────
//
// Llama 3 / Mixtral via the groq-sdk. createGroqProvider() returns an
// instance with its own lazily-initialized SDK client and circuit
// breaker; the registered `groq` factory returns one such instance for
// the life of the process. Supports both request/response and streaming
// modes. The client applies LLM_REQUEST_TIMEOUT_MS (30s by default) to
// each attempt and retries a timed-out attempt once, unless the caller's
// client options set `timeout` or `maxRetries`;
// resilience/request-timeout.ts gives the bound that makes.
//
// Sends the caller's `temperature`, and 1 when the caller sets none, and
// the caller's `topP` when one is set.
//
// Auth: GROQ_API_KEY environment variable (read by the SDK).
//

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export interface GroqProviderOptions {
  /**
   * SDK client options: credentials (GROQ_API_KEY when unset), base URL,
   * timeout (LLM_REQUEST_TIMEOUT_MS when unset), maxRetries
   * (REQUEST_MAX_RETRIES when unset), or the `fetch` requests go through.
   */
  client?: ClientOptions;
}

/**
 * A Groq provider instance with its own SDK client and circuit breaker.
 * The registered `groq` provider is one of these, built with no options.
 */
export function createGroqProvider(options: GroqProviderOptions = {}): LlmProvider {
  let client: Groq | null = null;
  const cb = createCircuitBreaker();

  function getClient(): Groq {
    if (!client) {
      client = new Groq({
        timeout: REQUEST_TIMEOUT_MS,
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

      let resolveResponse: (value: LlmResponse) => void;
      const responsePromise = new Promise<LlmResponse>((resolve) => {
        resolveResponse = resolve;
      });

      async function* generate(): AsyncGenerator<StreamChunk> {
        const start = performance.now();
        let fullText = "";

        const stream = await getClient().chat.completions.create({
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
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            yield { text: delta, done: false };
          }
        }

        yield { text: "", done: true };

        const latencyMs = performance.now() - start;
        const usage = {
          inputTokens: countTokens(messages.map((m) => m.content).join(" "), model),
          outputTokens: countTokens(fullText, model),
        };
        const modelPricing = getPricing(model);
        const cost = estimateCost(usage, modelPricing);

        resolveResponse!({
          text: fullText,
          model,
          provider: "groq",
          usage,
          latencyMs,
          cost,
        });
      }

      const iterator = generate();

      return {
        [Symbol.asyncIterator]() {
          return iterator;
        },
        response: responsePromise,
      };
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
