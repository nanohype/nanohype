import OpenAI from "openai";
import type { GatewayProvider, ProviderPricing } from "./types.js";
import type { ChatMessage, GatewayResponse, ChatOptions } from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "./circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";

// ── OpenAI Provider ─────────────────────────────────────────────────
//
// GPT-4o via the openai SDK. Wraps API calls in a circuit breaker
// for fault isolation. Maps OpenAI chat completion responses into
// the unified GatewayResponse shape.
//

const DEFAULT_MODEL = "gpt-4o";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI();
  return client;
}

const cb = createCircuitBreaker();

const openaiProvider: GatewayProvider = {
  name: "openai",

  pricing: {
    input: 2.5,
    output: 10,
  } satisfies ProviderPricing,

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

// Self-register
registerProvider(openaiProvider);
