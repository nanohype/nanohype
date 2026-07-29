import OpenAI from "openai";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { ChatMessage, LlmProvider } from "./types.js";

const client = new OpenAI();
const cb = createCircuitBreaker();

class OpenAIProvider implements LlmProvider {
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const response = await cb.execute(() =>
      client.chat.completions.create({
        model: "gpt-4o",
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
