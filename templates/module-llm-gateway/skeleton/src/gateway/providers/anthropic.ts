import Anthropic from "@anthropic-ai/sdk";
import type { GatewayProvider, ProviderPricing } from "./types.js";
import type { ChatMessage, GatewayResponse, ChatOptions } from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "./circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";

// ── Anthropic Provider ──────────────────────────────────────────────
//
// Claude Sonnet via the @anthropic-ai/sdk. Wraps API calls in a
// circuit breaker for fault isolation. Maps Anthropic-native
// responses into the unified GatewayResponse shape.
//

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const cb = createCircuitBreaker();

const anthropicProvider: GatewayProvider = {
  name: "anthropic",

  pricing: {
    input: 3,
    output: 15,
  } satisfies ProviderPricing,

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
    const model = opts?.model ?? DEFAULT_MODEL;
    const maxTokens = opts?.maxTokens ?? 4096;
    const temperature = opts?.temperature ?? 1;

    // Separate system messages from conversation
    const systemParts = messages.filter((m) => m.role === "system");
    const conversationParts = messages.filter((m) => m.role !== "system");
    const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

    const start = performance.now();

    const response = await cb.execute(() =>
      getClient().messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
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

// Self-register
registerProvider("anthropic", () => anthropicProvider);
