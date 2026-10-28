/**
 * Anthropic LLM provider (Claude models).
 *
 * Registers itself as the "anthropic" LLM provider on import.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k`, so the
 * `temperature` the provider interface passes in is not sent. The first
 * request an instance serves says so at debug level.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerLlmProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);

class AnthropicLlm implements LlmProvider {
  private readonly client: Anthropic;
  private readonly cb = createCircuitBreaker();
  private droppedTemperatureLogged = false;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required when using the Anthropic provider",
      );
    }
    this.client = new Anthropic({ apiKey: key, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  }

  private noteDroppedTemperature(temperature: number): void {
    if (this.droppedTemperatureLogged) return;
    this.droppedTemperatureLogged = true;
    logger.debug("anthropic sends no temperature", { temperature });
  }

  async generate(
    systemPrompt: string,
    userMessage: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    this.noteDroppedTemperature(temperature);
    const response = await this.cb.execute(() =>
      this.client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    );

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
