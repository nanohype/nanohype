/**
 * Anthropic LLM provider (Claude models).
 *
 * Registers itself as the "anthropic" LLM provider on import.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any value,
 * so the configured `temperature` is not sent. An instance logs the first
 * request that carries one, once, at debug level; generation holds one
 * instance for each loaded configuration.
 *
 * The client applies the request timeout to each attempt and retries a
 * timed-out attempt once; resilience/request-timeout.ts gives the bound that
 * makes.
 */

import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, REQUEST_MAX_RETRIES } from "../resilience/request-timeout.js";
import { registerLlmProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

export interface AnthropicLlmOptions {
  /** The API key. ANTHROPIC_API_KEY when unset or empty. */
  apiKey?: string;
  /** How long each attempt waits, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
  /**
   * SDK client configuration (base URL, maxRetries, the `fetch` requests go
   * through), applied over the request timeout and REQUEST_MAX_RETRIES and
   * under the API key.
   */
  client?: ClientOptions;
}

/** The Anthropic LLM. */
export class AnthropicLlm implements LlmProvider {
  private readonly client: Anthropic;
  private readonly cb = createCircuitBreaker();
  private droppedTemperatureLogged = false;

  constructor(options: AnthropicLlmOptions = {}) {
    const key = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required when using the Anthropic provider",
      );
    }
    this.client = new Anthropic({
      timeout: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      maxRetries: REQUEST_MAX_RETRIES,
      ...options.client,
      apiKey: key,
    });
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
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    if (temperature !== undefined) this.noteDroppedTemperature(temperature);
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

registerLlmProvider(
  "anthropic",
  (settings) =>
    new AnthropicLlm({
      apiKey: settings.anthropicApiKey,
      requestTimeoutMs: settings.requestTimeoutMs,
    }),
);
