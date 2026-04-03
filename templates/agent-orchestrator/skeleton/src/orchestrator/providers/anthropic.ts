import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// ── Anthropic Provider ──────────────────────────────────────────────
//
// LLM provider backed by the Anthropic Messages API. Uses the
// circuit breaker to handle API failures gracefully. SDK client
// is lazily initialized on first use.
//

function createAnthropicProvider(): LlmProvider {
  let client: Anthropic | null = null;
  const cb = createCircuitBreaker();

  function getClient(): Anthropic {
    if (!client) {
      client = new Anthropic();
    }
    return client;
  }

  return {
    name: "anthropic",

    async complete(systemPrompt: string, userMessage: string): Promise<string> {
      const response = await cb.execute(() =>
        getClient().messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      );

      const textBlocks = response.content.filter((b) => b.type === "text");
      return textBlocks.map((b) => b.text).join("");
    },
  };
}

// Self-register
registerProvider("anthropic", createAnthropicProvider);
