import OpenAI from "openai";
import type { LlmProvider } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// ── OpenAI Provider ─────────────────────────────────────────────────
//
// LLM provider backed by the OpenAI Chat Completions API. Uses the
// circuit breaker to handle API failures gracefully. SDK client
// is lazily initialized on first use.
//

function createOpenAIProvider(): LlmProvider {
  let client: OpenAI | null = null;
  const cb = createCircuitBreaker();

  function getClient(): OpenAI {
    if (!client) {
      client = new OpenAI();
    }
    return client;
  }

  return {
    name: "openai",

    async complete(systemPrompt: string, userMessage: string): Promise<string> {
      const response = await cb.execute(() =>
        getClient().chat.completions.create({
          model: "gpt-4o",
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      );

      return response.choices[0]?.message.content ?? "";
    },
  };
}

// Self-register
registerProvider("openai", createOpenAIProvider);
