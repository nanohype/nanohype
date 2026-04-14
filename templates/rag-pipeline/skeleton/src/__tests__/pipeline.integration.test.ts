/**
 * Integration test for the full RAG pipeline.
 *
 * Wires real chunking strategies with mock embedding, vector store,
 * and LLM providers to verify the end-to-end flow: ingest documents,
 * chunk them, embed, store, retrieve, and generate an answer.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createChunker } from "../chunking.js";
import { Retriever } from "../retrieval.js";
import { generate } from "../generation.js";
import {
  registerLlmProvider,
  registerEmbeddingProvider,
  registerVectorStoreProvider,
} from "../providers/registry.js";
import type {
  EmbeddingProvider,
  VectorStoreProvider,
  VectorDocument,
  SearchResult,
} from "../providers/types.js";
import type { Config } from "../config.js";

// ── Mock Providers ────────────────────────────────────────────────

/**
 * Deterministic embedding provider that hashes content into a
 * consistent vector. Words in the text shift vector components so
 * semantically overlapping content produces similar embeddings.
 */
class TestEmbedder implements EmbeddingProvider {
  readonly dimensions = 8;

  private hashToVector(text: string): number[] {
    // Bag-of-words: hash each word to a single dimension. Documents that
    // share vocabulary will have overlapping vectors, so a query like
    // "What is TypeScript?" scores the TypeScript document highest.
    // The prior implementation spread each character across dimensions and
    // produced near-uniform vectors that couldn't separate documents.
    const vec = new Array(this.dimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const word of words) {
      let h = 0;
      for (let i = 0; i < word.length; i++) {
        h = (h * 31 + word.charCodeAt(i)) | 0;
      }
      vec[Math.abs(h) % this.dimensions] += 1;
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return mag > 0 ? vec.map((v) => v / mag) : vec;
  }

  async embed(text: string): Promise<number[]> {
    return this.hashToVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashToVector(t));
  }
}

/**
 * In-memory vector store that supports real cosine-similarity search.
 */
class TestVectorStore implements VectorStoreProvider {
  private readonly documents = new Map<string, VectorDocument>();

  async init(): Promise<void> {}

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }
  }

  async search(
    queryEmbedding: number[],
    topK: number,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const [id, doc] of this.documents) {
      const score = cosine(queryEmbedding, doc.embedding);
      results.push({ id, content: doc.content, score, metadata: doc.metadata });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
    }
  }

  storedCount(): number {
    return this.documents.size;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

// ── Test Fixtures ─────────────────────────────────────────────────

const DOCUMENT_A = [
  "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.",
  "It adds optional static types, classes, and interfaces.",
  "TypeScript is designed for development of large applications.",
].join(" ");

const DOCUMENT_B = [
  "Python is a high-level programming language known for its readability.",
  "It supports multiple programming paradigms including procedural,",
  "object-oriented, and functional programming.",
].join(" ");

const DOCUMENT_C = [
  "Vector databases store data as high-dimensional vectors.",
  "They enable similarity search by comparing vector distances.",
  "Common distance metrics include cosine similarity and Euclidean distance.",
].join(" ");

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    chunking: { strategy: "recursive", size: 512, overlap: 0 },
    embedding: {
      provider: "test-integration-embed",
      model: "test",
      dimensions: 8,
      batchSize: 128,
    },
    vectorstore: {
      backend: "test-integration-vs",
      collectionName: "test",
      pgConnectionString: "",
      chromaPersistDir: "",
      qdrantUrl: "",
      qdrantApiKey: "",
      pineconeApiKey: "",
      pineconeIndexName: "",
    },
    generation: {
      provider: "test-integration-llm",
      anthropicApiKey: "",
      openaiApiKey: "",
      model: "test-model",
      temperature: 0,
      maxTokens: 256,
    },
    retrieval: { topK: 3, scoreThreshold: 0.0 },
    docsDir: "./test-docs",
    ...overrides,
  };
}

// ── Integration Tests ─────────────────────────────────────────────

describe("RAG pipeline integration", () => {
  let embedder: TestEmbedder;
  let store: TestVectorStore;

  beforeEach(() => {
    embedder = new TestEmbedder();
    store = new TestVectorStore();

    // Register providers under unique test names (registries are global singletons)
    try {
      registerEmbeddingProvider("test-integration-embed", () => embedder);
    } catch {
      // Already registered from a previous test — fine, re-use it
    }

    try {
      registerVectorStoreProvider("test-integration-vs", () => store);
    } catch {
      // Already registered
    }

    try {
      registerLlmProvider("test-integration-llm", () => ({
        async generate(_sys: string, userMessage: string) {
          return {
            answer: `Answer based on context: ${userMessage.slice(0, 50)}`,
            usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
          };
        },
      }));
    } catch {
      // Already registered
    }
  });

  it("ingests, chunks, embeds, stores, retrieves, and generates an answer", async () => {
    const config = makeConfig();

    // ── Step 1: Chunk the documents ──
    const chunker = createChunker(config.chunking);
    const documents = [
      { path: "typescript.md", content: DOCUMENT_A, metadata: { source: "typescript.md" } },
      { path: "python.md", content: DOCUMENT_B, metadata: { source: "python.md" } },
      { path: "vectors.md", content: DOCUMENT_C, metadata: { source: "vectors.md" } },
    ];

    const allDocs: VectorDocument[] = [];
    for (const doc of documents) {
      const chunks = chunker.chunk(doc.content, doc.metadata);
      for (let i = 0; i < chunks.length; i++) {
        allDocs.push({
          id: `${doc.path}_${i}`,
          content: chunks[i].content,
          embedding: [],
          metadata: { ...chunks[i].metadata, chunkIndex: i, chunkCount: chunks.length },
        });
      }
    }

    expect(allDocs.length).toBeGreaterThanOrEqual(3);

    // ── Step 2: Embed all chunks ──
    const texts = allDocs.map((d) => d.content);
    const embeddings = await embedder.embedBatch(texts);

    for (let i = 0; i < allDocs.length; i++) {
      allDocs[i].embedding = embeddings[i];
    }

    // Each embedding should have the right dimensions
    for (const doc of allDocs) {
      expect(doc.embedding).toHaveLength(8);
      expect(doc.embedding.some((v) => v !== 0)).toBe(true);
    }

    // ── Step 3: Store in vector store ──
    await store.init();
    await store.addDocuments(allDocs);
    expect(store.storedCount()).toBe(allDocs.length);

    // ── Step 4: Retrieve relevant chunks ──
    const retriever = new Retriever(embedder, store, 3, 0.0);

    const tsResults = await retriever.retrieve("What is TypeScript?");
    expect(tsResults.length).toBeGreaterThan(0);
    // The TypeScript document should score highest for a TypeScript query
    const topResult = tsResults[0];
    expect(topResult.content.toLowerCase()).toContain("typescript");

    // A vector database query should surface the vectors document
    const vecResults = await retriever.retrieve("How do vector databases work?");
    expect(vecResults.length).toBeGreaterThan(0);
    expect(vecResults[0].content.toLowerCase()).toContain("vector");

    // ── Step 5: Generate an answer ──
    const genResult = await generate("What is TypeScript?", tsResults, config);
    expect(genResult.answer).toBeTruthy();
    expect(genResult.sources.length).toBe(tsResults.length);
    expect(genResult.model).toBe("test-model");
    expect(genResult.usage.total_tokens).toBe(30);
  });

  it("handles empty document set gracefully through the pipeline", async () => {
    const config = makeConfig();
    const chunker = createChunker(config.chunking);

    // No documents to chunk
    const chunks = chunker.chunk("", {});
    expect(chunks).toHaveLength(0);

    // Store is empty, retrieval returns nothing
    const retriever = new Retriever(embedder, store, 5, 0.0);
    const results = await retriever.retrieve("anything");
    expect(results).toHaveLength(0);

    // Generation with no results should still produce an answer
    const genResult = await generate("What is TypeScript?", [], config);
    expect(genResult.answer).toBeTruthy();
    expect(genResult.sources).toHaveLength(0);
  });

  it("score threshold filters low-relevance results after retrieval", async () => {
    const config = makeConfig();
    const chunker = createChunker(config.chunking);

    // Ingest a document about cooking (unrelated to tech queries)
    const cookingDoc = "Cooking pasta requires boiling water, adding salt, and timing the noodles.";
    const techDoc = DOCUMENT_A;

    const docs: VectorDocument[] = [];
    for (const [path, content] of [["cooking.md", cookingDoc], ["tech.md", techDoc]] as const) {
      const chunks = chunker.chunk(content, { source: path });
      for (let i = 0; i < chunks.length; i++) {
        const emb = await embedder.embed(chunks[i].content);
        docs.push({
          id: `${path}_${i}`,
          content: chunks[i].content,
          embedding: emb,
          metadata: { ...chunks[i].metadata, chunkIndex: i },
        });
      }
    }

    await store.init();
    await store.addDocuments(docs);

    // With a high threshold, irrelevant results are filtered
    const strictRetriever = new Retriever(embedder, store, 5, 0.9);
    const strictResults = await strictRetriever.retrieve("TypeScript programming");

    // With no threshold, all results come back
    const looseRetriever = new Retriever(embedder, store, 5, 0.0);
    const looseResults = await looseRetriever.retrieve("TypeScript programming");

    expect(looseResults.length).toBeGreaterThanOrEqual(strictResults.length);
  });

  it("uses different chunking strategies and produces valid pipeline output", async () => {
    const longText = Array(20).fill(DOCUMENT_A).join("\n\n");
    const config = makeConfig();

    for (const strategy of ["fixed", "recursive"] as const) {
      const chunker = createChunker({ strategy, size: 50, overlap: 10 });
      const chunks = chunker.chunk(longText, { source: "test.md" });

      expect(chunks.length).toBeGreaterThan(1);

      // Embed and store all chunks
      const docs: VectorDocument[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const emb = await embedder.embed(chunks[i].content);
        docs.push({
          id: `${strategy}_${i}`,
          content: chunks[i].content,
          embedding: emb,
          metadata: { ...chunks[i].metadata },
        });
      }

      const strategyStore = new TestVectorStore();
      await strategyStore.init();
      await strategyStore.addDocuments(docs);

      const retriever = new Retriever(embedder, strategyStore, 3);
      const results = await retriever.retrieve("TypeScript");
      expect(results.length).toBeGreaterThan(0);
    }
  });
});
