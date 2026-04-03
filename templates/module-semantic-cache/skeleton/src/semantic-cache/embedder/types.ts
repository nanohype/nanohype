// ── Embedding Provider Interface ────────────────────────────────────
//
// All embedding providers implement this interface. The registry
// pattern allows new providers to be added by importing a provider
// module that calls registerEmbeddingProvider() at the module level.
//

export interface EmbeddingProvider {
  /** Unique provider name (e.g. "openai", "mock"). */
  readonly name: string;

  /** The dimensionality of the embedding vectors produced. */
  readonly dimensions: number;

  /** Generate an embedding vector for a single text input. */
  embed(text: string): Promise<number[]>;

  /** Generate embedding vectors for multiple text inputs. */
  embedBatch(texts: string[]): Promise<number[][]>;
}
