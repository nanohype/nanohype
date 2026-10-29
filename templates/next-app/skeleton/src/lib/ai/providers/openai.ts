import OpenAI from "openai";
import { registerProvider } from "./registry.js";
import type { AiProvider, ChatMessage } from "./types.js";

class OpenAIProvider implements AiProvider {
  readonly defaultModel = "gpt-4o";

  resolveModel(model?: string): string {
    return model ?? this.defaultModel;
  }

  async sendMessage(messages: ChatMessage[], model?: string): Promise<string> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: this.resolveModel(model),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.choices[0]?.message?.content ?? "";
  }

  async *streamMessage(messages: ChatMessage[], model?: string): AsyncIterable<string> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const stream = await client.chat.completions.create({
      model: this.resolveModel(model),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

registerProvider("openai", () => new OpenAIProvider());
