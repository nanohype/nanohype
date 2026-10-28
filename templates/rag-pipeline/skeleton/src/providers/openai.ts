/**
 * OpenAI LLM and embedding provider.
 *
 * Registers itself as the "openai" LLM provider and the "openai"
 * embedding provider on import.
 *
 * The LLM sends the configured `temperature`, and 0.1 when the
 * configuration sets none.
 *
 * Each client applies the request timeout to each attempt and retries a
 * timed-out attempt once; resilience/request-timeout.ts gives the bound that
 * makes.
 */

import OpenAI, { type ClientOptions } from "openai";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, REQUEST_MAX_RETRIES } from "../resilience/request-timeout.js";
import { registerEmbeddingProvider, registerLlmProvider } from "./registry.js";
import type { EmbeddingProvider, LlmProvider } from "./types.js";

export interface OpenAIClientSettings {
  /** The API key. OPENAI_API_KEY when unset or empty. */
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

function newClient(settings: OpenAIClientSettings, missingKey: string): OpenAI {
  const key = settings.apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error(missingKey);
  return new OpenAI({
    timeout: settings.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxRetries: REQUEST_MAX_RETRIES,
    ...settings.client,
    apiKey: key,
  });
}

/** The temperature the LLM sends when the configuration sets none. */
const DEFAULT_TEMPERATURE = 0.1;

/** The OpenAI LLM. */
export class OpenAILlm implements LlmProvider {
  private readonly client: OpenAI;
  private readonly cb = createCircuitBreaker();

  constructor(options: OpenAIClientSettings = {}) {
    this.client = newClient(
      options,
      "OPENAI_API_KEY environment variable is required when using the OpenAI provider",
    );
  }

  async generate(
    systemPrompt: string,
    userMessage: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    const response = await this.cb.execute(() =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: maxTokens,
      }),
    );

    const answer = response.choices[0]?.message?.content ?? "";

    const usage: Record<string, number> = {};
    if (response.usage) {
      usage.prompt_tokens = response.usage.prompt_tokens;
      usage.completion_tokens = response.usage.completion_tokens;
      usage.total_tokens = response.usage.total_tokens;
    }

    return { answer, usage };
  }
}

export interface OpenAIEmbedderOptions extends OpenAIClientSettings {
  /** The embedding model id. Default: text-embedding-3-small. */
  model?: string;
  /** The width of the vectors it asks for. Default: 1536. */
  dimensions?: number;
  /** How many inputs one request embeds. Default: 128. */
  batchSize?: number;
}

/** The OpenAI embedder. */
export class OpenAIEmbedder implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly dims: number;
  private readonly batchSize: number;
  private readonly cb = createCircuitBreaker();

  constructor(options: OpenAIEmbedderOptions = {}) {
    this.client = newClient(
      options,
      "OPENAI_API_KEY environment variable is required for OpenAI embeddings",
    );
    this.model = options.model ?? "text-embedding-3-small";
    this.dims = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 128;
  }

  get dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.cb.execute(() =>
      this.client.embeddings.create({
        input: [text],
        model: this.model,
        dimensions: this.dims,
      }),
    );
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.cb.execute(() =>
        this.client.embeddings.create({
          input: batch,
          model: this.model,
          dimensions: this.dims,
        }),
      );
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sorted.map((item) => item.embedding));
    }

    return allEmbeddings;
  }
}

registerLlmProvider(
  "openai",
  (settings) =>
    new OpenAILlm({ apiKey: settings.openaiApiKey, requestTimeoutMs: settings.requestTimeoutMs }),
);
registerEmbeddingProvider("openai", (settings) => new OpenAIEmbedder(settings));
