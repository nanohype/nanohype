import OpenAI from "openai";
import type { AiProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

class OpenAIProvider implements AiProvider {
  readonly defaultModel = "gpt-4o";

  async sendMessage(
    messages: ChatMessage[],
    apiKey: string,
    model?: string,
  ): Promise<string> {
    const client = new OpenAI({
      apiKey,
      // Required for use in service worker (no Node.js APIs)
      dangerouslyAllowBrowser: true,
    });

    const response = await client.chat.completions.create({
      model: model ?? this.defaultModel,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.choices[0]?.message?.content ?? "";
  }
}

registerProvider("openai", new OpenAIProvider());
