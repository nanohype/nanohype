/**
 * Anthropic LLM provider for the CI eval pipeline.
 *
 * Sends single-prompt completions to Claude and returns the text
 * response. Requires the ANTHROPIC_API_KEY environment variable.
 * Registers itself as the "anthropic" provider on import.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "./types.js";
import { registerProvider } from "./registry.js";

class AnthropicProvider implements LlmProvider {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) this.client = new Anthropic();
    return this.client;
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : "";
  }
}

registerProvider("anthropic", () => new AnthropicProvider());
