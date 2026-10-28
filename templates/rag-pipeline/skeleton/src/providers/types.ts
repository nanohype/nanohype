/**
 * Shared interfaces for all provider types: LLM generation,
 * embedding, and vector storage.
 */

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
