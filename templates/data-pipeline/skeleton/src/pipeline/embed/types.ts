// ── Embedding Provider Interface ────────────────────────────────────
//
// All embedding providers implement this interface. Each provider
// generates dense vector embeddings from text input, either one at
// a time or in batches.
//

export interface EmbeddingProvider {
  /** Unique provider name (e.g. "openai", "mock"). */
  readonly name: string;

  /** Dimensionality of the output embedding vectors. */
  readonly dimensions: number;

  /**
   * Generate an embedding for a single text input.
   *
   * @param text  The input text to embed.
   * @returns     Dense float embedding vector.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple text inputs in batches.
   *
   * @param texts  Array of input texts to embed.
   * @returns      Array of dense float embedding vectors, in the same order.
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}
