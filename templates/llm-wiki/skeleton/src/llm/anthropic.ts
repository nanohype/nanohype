import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { getConfig } from "../config.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerLlmProvider } from "./registry.js";
import type { LlmMessage, LlmOptions, LlmProvider } from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * How many more attempts the client makes after an attempt that times out or
 * fails with an error the SDK retries.
 */
const MAX_RETRIES = 1;

/**
 * The Anthropic LLM provider. It builds its client on first use, from
 * ANTHROPIC_API_KEY. The client applies the configured LLM_REQUEST_TIMEOUT_MS
 * to each attempt and retries a timed-out attempt once, so an endpoint that
 * never answers holds the caller for two timeouts plus the SDK's backoff
 * between the attempts. `clientOptions` is SDK client configuration (base
 * URL, timeout, maxRetries, the `fetch` requests go through), applied over
 * that timeout and retry count and under that key.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic | null = null;
  private cb = createCircuitBreaker();

  constructor(private readonly clientOptions: ClientOptions = {}) {}

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is required");
      }
      this.client = new Anthropic({
        timeout: getConfig().LLM_REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
        ...this.clientOptions,
        apiKey,
      });
    }
    return this.client;
  }

  async complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string> {
    const client = this.getClient();

    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // No sampling parameters: the Messages API rejects `temperature`, `top_p`
    // and `top_k`.
    const response = await this.cb.execute(() =>
      client.messages.create({
        model: opts?.model ?? DEFAULT_MODEL,
        max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(systemMessage ? { system: systemMessage.content } : {}),
        messages: conversationMessages,
      }),
    );

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in Anthropic response");
    }

    return textBlock.text;
  }
}

registerLlmProvider("anthropic", () => new AnthropicLlmProvider());
