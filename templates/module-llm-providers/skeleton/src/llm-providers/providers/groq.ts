import Groq from "groq-sdk";
import type { LlmProvider } from "./types.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  StreamResponse,
  StreamChunk,
  Pricing,
} from "../types.js";
import { getPricing, estimateCost } from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";
import { logger } from "../logger.js";

// ── Groq Provider ──────────────────────────────────────────────────
//
// Llama 3 / Mixtral via the groq-sdk. Each factory call returns a
// new instance with its own lazily-initialized SDK client and circuit
// breaker. Supports both request/response and streaming modes.
//
// Auth: GROQ_API_KEY environment variable (read by the SDK).
//

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function createGroqProvider(): LlmProvider {
  let client: Groq | null = null;
  const cb = createCircuitBreaker();

  function getClient(): Groq {
    if (!client) {
      client = new Groq();
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

// Self-register factory
registerProvider("groq", createGroqProvider);
