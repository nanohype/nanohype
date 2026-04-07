/**
 * OpenAI LLM provider for the CI eval pipeline.
 *
 * Sends single-prompt completions to GPT and returns the text
 * response. Requires the OPENAI_API_KEY environment variable.
 * Registers itself as the "openai" provider on import.
 */

import OpenAI from "openai";
import type { LlmProvider } from "./types.js";
import { registerProvider } from "./registry.js";

class OpenAIProvider implements LlmProvider {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) this.client = new OpenAI();
    return this.client;
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    });
    return response.choices[0]?.message?.content ?? "";
  }
}

registerProvider("openai", () => new OpenAIProvider());
