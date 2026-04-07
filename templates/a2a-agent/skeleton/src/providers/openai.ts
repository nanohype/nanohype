import OpenAI from "openai";
import type { LlmProvider, Message, LlmResponse } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

const client = new OpenAI();
const cb = createCircuitBreaker();

class OpenAIProvider implements LlmProvider {
  async sendMessage(
    systemPrompt: string,
    messages: Message[],
  ): Promise<LlmResponse> {
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const response = await cb.execute(() =>
      client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: openaiMessages,
      }),
    );

    const choice = response.choices[0];
    if (!choice) {
      return { content: "", stopReason: "error" };
    }

    return {
      content: choice.message.content ?? "",
      stopReason: choice.finish_reason ?? "stop",
    };
  }
}

registerProvider("openai", () => new OpenAIProvider());
