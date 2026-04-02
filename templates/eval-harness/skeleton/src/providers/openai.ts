import OpenAI from "openai";
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

/**
 * OpenAI LLM provider. Sends chat messages to GPT and returns the text
 * response. Requires the OPENAI_API_KEY environment variable.
 */
export class OpenAIProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;

  constructor(model = "gpt-4o") {
    this.client = new OpenAI();
    this.model = model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    return response.choices[0]?.message?.content ?? "";
  }
}

registerProvider("openai", () => new OpenAIProvider());
