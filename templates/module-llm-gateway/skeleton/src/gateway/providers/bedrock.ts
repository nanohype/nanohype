import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { GatewayProvider, ProviderPricing } from "./types.js";
import type { ChatMessage, GatewayResponse, ChatOptions } from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "./circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";

// ── Bedrock Provider ────────────────────────────────────────────────
//
// The org-default LLM path: Claude Sonnet via the Bedrock Converse API.
// Auth is the AWS credential chain (IRSA on the cluster), never API keys.
// A cachePoint after the (stable) system prompt amortizes the prefix
// across turns — the mandated prompt-caching pattern; cache_read/write
// tokens are reported in usage so the hit ratio is observable. Every call
// carries an explicit request timeout so a hung Bedrock socket trips the
// circuit breaker instead of hanging forever.
//

const DEFAULT_MODEL = process.env.LLM_MODEL ?? "anthropic.claude-sonnet-4-6";
const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-west-2" });
  }
  return client;
}

const cb = createCircuitBreaker();

const bedrockProvider: GatewayProvider = {
  name: "bedrock",

  // Claude Sonnet on Bedrock — same per-1M-token rates as the Anthropic API.
  pricing: {
    input: 3,
    output: 15,
  } satisfies ProviderPricing,

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
    const model = opts?.model ?? DEFAULT_MODEL;
    const maxTokens = opts?.maxTokens ?? 4096;
    const temperature = opts?.temperature ?? 1;

    // Separate system messages from the conversation — Bedrock takes the
    // system prompt as its own field, with the cachePoint right after it.
    const systemParts = messages.filter((m) => m.role === "system");
    const conversationParts = messages.filter((m) => m.role !== "system");
    const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

    const start = performance.now();

    const response = await cb.execute(() =>
      getClient().send(
        new ConverseCommand({
          modelId: model,
          system: systemPrompt
            ? [{ text: systemPrompt }, { cachePoint: { type: "default" } }]
            : undefined,
          messages: conversationParts.map((m) => ({
            role: m.role as "user" | "assistant",
            content: [{ text: m.content }],
          })),
          inferenceConfig: { temperature, maxTokens },
        }),
        // Per-request timeout — a hung Bedrock socket trips the breaker
        // instead of hanging forever.
        { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      ),
    );

    const latencyMs = performance.now() - start;
    const usage = response.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    const blocks = response.output?.message?.content ?? [];
    const text = blocks
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();

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
registerProvider("bedrock", () => bedrockProvider);
