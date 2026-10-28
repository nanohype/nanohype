/**
 * Shared interfaces for all provider types: LLM generation,
 * embedding, and vector storage.
 */

/** The values a SamplingParameters setting takes. */
export const SAMPLING_PARAMETERS = ["auto", "send", "omit"] as const;

/**
 * Which bedrock requests carry the configured temperature: `auto` sends it to
 * a model id that names a family other than Claude and to no other, `send`
 * sends it to every model id, and `omit` sends it to none.
 */
export type SamplingParameters = (typeof SAMPLING_PARAMETERS)[number];

export interface LlmProvider {
  /**
   * Answer `userMessage` under `systemPrompt`. `temperature` is undefined
   * when the configuration sets none; config.ts states what each provider
   * sends, set or unset.
   */
  generate(
    systemPrompt: string,
    userMessage: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }>;
}

/**
 * What the pipeline hands every LLM factory, from the loaded configuration.
 * Each provider takes the settings that apply to it: anthropic and openai
 * their own API key, bedrock its sampling rule, and all three the request
 * timeout.
 */
export interface LlmProviderSettings {
  /** ANTHROPIC_API_KEY. The anthropic provider reads the environment when it is empty. */
  anthropicApiKey?: string;
  /** OPENAI_API_KEY. The openai provider reads the environment when it is empty. */
  openaiApiKey?: string;
  /** Which bedrock requests carry the configured temperature. */
  samplingParameters?: SamplingParameters;
  /** LLM_REQUEST_TIMEOUT_MS, in milliseconds. */
  requestTimeoutMs?: number;
}

/** What the pipeline hands every embedding factory, from the loaded configuration. */
export interface EmbeddingProviderSettings {
  /** The embedding model id. Each provider has its own default. */
  model?: string;
  /** The width of the vectors it returns. */
  dimensions?: number;
  /** How many inputs one request embeds, for a provider that batches. */
  batchSize?: number;
  /** LLM_REQUEST_TIMEOUT_MS, in milliseconds, for a provider that reads it. */
  requestTimeoutMs?: number;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStoreProvider {
  init(): Promise<void>;
  addDocuments(documents: VectorDocument[]): Promise<void>;
  search(
    queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]>;
  delete(ids: string[]): Promise<void>;
}
