import OpenAI from "openai";
import { readRequestTimeoutMs } from "../config.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { ChatMessage, LlmProvider } from "./types.js";

// Direct OpenAI API, for the bot off the nanohype substrate (set
// LLM_PROVIDER=openai). Requires OPENAI_API_KEY, which the LLM policy
// permits only when the intake brief names OpenAI. The SDK client is given
// an explicit per-request timeout so a hung socket trips the breaker; the
// model id is injectable via OPENAI_MODEL.

const REQUEST_TIMEOUT_MS = readRequestTimeoutMs();
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
