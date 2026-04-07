import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

/**
 * Anthropic LLM provider. Sends chat messages to Claude and returns
 * the text response. Requires the ANTHROPIC_API_KEY environment variable.
 */
export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  private model: string;
  private cb = createCircuitBreaker();

  constructor(model = "claude-sonnet-4-20250514") {
    this.client = new Anthropic();
    this.model = model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    // Extract system message if present; Anthropic takes it as a separate param
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const response = await this.cb.execute(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: nonSystem.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      }),
    );

    const textBlocks = response.content.filter((block) => block.type === "text");
    return textBlocks.map((block) => block.text).join("");
  }
}

registerProvider("anthropic", () => new AnthropicProvider());
