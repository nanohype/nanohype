import OpenAI from "openai";
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// Direct OpenAI API — an alternate to the Bedrock default
// (set LLM_PROVIDER=openai). Requires OPENAI_API_KEY. Explicit per-request
// timeout so a hung socket trips the breaker; model id injectable via OPENAI_MODEL.

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

const client = new OpenAI({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
const cb = createCircuitBreaker();

class OpenAIProvider implements LlmProvider {
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const response = await cb.execute(() =>
      client.chat.completions.create({
        model: MODEL,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
      }),
    );

    return response.choices[0]?.message?.content ?? "";
  }
}

registerProvider("openai", () => new OpenAIProvider());
