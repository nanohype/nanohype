/**
 * Retrieval logic.
 *
 * Handles the query side of the RAG pipeline: take a user query, embed it,
 * search the vector store, rerank results, and return the most relevant
 * document chunks with their scores.
 */

import type { Config } from "./config.js";
import type { EmbeddingProvider, VectorStoreProvider, SearchResult } from "./providers/types.js";
import { getEmbeddingProvider, getVectorStoreProvider } from "./providers/index.js";
import { logger } from "./logger.js";

export interface RetrievalResult {
  content: string;
  score: number;
  source: string;
  metadata: Record<string, unknown>;
  rank: number;
}

/**
 * Orchestrates embedding, search, and reranking.
 *
 * The retriever is the main interface for the query path. It:
 *
 * 1. Embeds the user query using the configured provider
 * 2. Searches the vector store for similar chunks
 * 3. Filters results below the score threshold
 * 4. Reranks by similarity score (descending)
 * 5. Returns structured results with provenance metadata
 */
export class Retriever {
  private readonly embedder: EmbeddingProvider;
  private readonly store: VectorStoreProvider;
  private readonly topK: number;
  private readonly scoreThreshold: number;

  constructor(
    embedder: EmbeddingProvider,
    store: VectorStoreProvider,
    topK = 5,
    scoreThreshold = 0.0,
  ) {
    this.embedder = embedder;
    this.store = store;
    this.topK = topK;
    this.scoreThreshold = scoreThreshold;
  }

  /**
   * Retrieve the most relevant chunks for a query.
   */
  async retrieve(
    query: string,
    topK?: number,
    filter?: Record<string, unknown>,
  ): Promise<RetrievalResult[]> {
    const k = topK ?? this.topK;

    const queryEmbedding = await this.embedder.embed(query);

    const rawResults = await this.store.search(queryEmbedding, k, filter);

    const filtered = this.filterByScore(rawResults);

    const ranked = this.rerank(filtered);

    const results = ranked.map((sr, i) => ({
      content: sr.content,
      score: sr.score,
      source: (sr.metadata.source as string) ?? "unknown",
      metadata: sr.metadata,
      rank: i + 1,
    }));

    logger.info("Retrieval complete", {
      results: results.length,
      topK: k,
      threshold: this.scoreThreshold,
    });

    return results;
  }

  private filterByScore(results: SearchResult[]): SearchResult[] {
    if (this.scoreThreshold <= 0.0) return results;

    const filtered = results.filter((r) => r.score >= this.scoreThreshold);
    if (filtered.length < results.length) {
      logger.debug("Filtered results below threshold", {
        removed: results.length - filtered.length,
        threshold: this.scoreThreshold,
      });
    }
    return filtered;
  }

  /**
   * Rerank results by similarity score, highest first.
   *
   * This is a basic score-based reranker. For more sophisticated
   * reranking, consider:
   * - Cross-encoder reranking (embed query+document pairs)
   * - Reciprocal rank fusion for multi-query retrieval
   * - LLM-based relevance scoring
   */
  private rerank(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => b.score - a.score);
  }
}

/**
 * Create a retriever from pipeline configuration.
 */
export async function createRetriever(config: Config): Promise<Retriever> {
  const embedder = getEmbeddingProvider(
    config.embedding.provider,
    config.embedding.model,
    config.embedding.dimensions,
    config.embedding.batchSize,
  );

  const store = getVectorStoreProvider(
    config.vectorstore.backend,
    config.vectorstore,
    config.embedding.dimensions,
  );
  await store.init();

  return new Retriever(
    embedder,
    store,
    config.retrieval.topK,
    config.retrieval.scoreThreshold,
  );
}
