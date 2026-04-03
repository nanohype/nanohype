import OpenAI from "openai";
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

// ── Azure OpenAI Provider ──────────────────────────────────────────
//
// Reuses the openai SDK with baseURL pointed at the Azure endpoint.
// The api-version header is set via defaultHeaders. Each factory call
// returns a new instance with its own client and circuit breaker.
//
// Auth: AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT env vars.
//

const DEFAULT_MODEL = "gpt-4o";

function createAzureOpenAIProvider(): LlmProvider {
  let client: OpenAI | null = null;
  const cb = createCircuitBreaker();

  function getClient(): OpenAI {
    if (!client) {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
      if (!endpoint) {
        throw new Error("AZURE_OPENAI_ENDPOINT environment variable is required");
      }

      const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";

      client = new OpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        baseURL: `${endpoint.replace(/\/$/, "")}/openai/deployments`,
        defaultQuery: { "api-version": apiVersion },
        defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY ?? "" },
      });
    }
    return client;
  }

  const pricing: Pricing = getPricing(DEFAULT_MODEL);

  return {
    name: "azure-openai",
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

      logger.debug("azure-openai chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "azure-openai", usage, latencyMs, cost };
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
          provider: "azure-openai",
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
registerProvider("azure-openai", createAzureOpenAIProvider);
