import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// Direct Anthropic API — an alternate to the Bedrock default
// (set LLM_PROVIDER=anthropic). Requires ANTHROPIC_API_KEY. The SDK client is
// given an explicit per-request timeout so a hung socket trips the breaker
// instead of hanging; the model id is injectable via ANTHROPIC_MODEL.

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
const cb = createCircuitBreaker();

class AnthropicProvider implements LlmProvider {
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const response = await cb.execute(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    );

    const textBlocks = response.content.filter((b) => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n") || "";
  }
}

registerProvider("anthropic", () => new AnthropicProvider());
