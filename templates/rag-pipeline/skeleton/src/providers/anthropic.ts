/**
 * Anthropic LLM provider (Claude models).
 *
 * Registers itself as the "anthropic" LLM provider on import.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "./types.js";
import { registerLlmProvider } from "./registry.js";

class AnthropicLlm implements LlmProvider {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required when using the Anthropic provider",
      );
    }
    this.client = new Anthropic({ apiKey: key });
  }

  async generate(
    systemPrompt: string,
    userMessage: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const answer = textBlock && "text" in textBlock ? textBlock.text : "";

    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    return { answer, usage };
  }
}

registerLlmProvider("anthropic", (apiKey?: unknown) => new AnthropicLlm(apiKey as string));
