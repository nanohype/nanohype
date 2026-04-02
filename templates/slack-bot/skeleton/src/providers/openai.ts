import OpenAI from "openai";
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

const client = new OpenAI();

class OpenAIProvider implements LlmProvider {
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }
}

registerProvider("openai", () => new OpenAIProvider());
