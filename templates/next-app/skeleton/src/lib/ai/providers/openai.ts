import OpenAI from "openai";
import type { AiProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

class OpenAIProvider implements AiProvider {
  readonly defaultModel = "gpt-4o";

  async sendMessage(messages: ChatMessage[], model?: string): Promise<string> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: model ?? this.defaultModel,
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
      model: model ?? this.defaultModel,
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

registerProvider("openai", new OpenAIProvider());
