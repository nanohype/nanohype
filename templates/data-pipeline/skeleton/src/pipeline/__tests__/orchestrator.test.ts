/**
 * Tests for the pipeline orchestrator.
 *
 * Runs a full pipeline with mock source, mock embedder, and console
 * output adapter. Verifies that all four stages execute correctly
 * and that per-document error handling works as expected.
 */

import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "../orchestrator.js";
import type { IngestSource } from "../ingest/types.js";
import type { ChunkStrategy } from "../transform/types.js";
import type { EmbeddingProvider } from "../embed/types.js";
import type { OutputAdapter } from "../output/types.js";
import type { Document, ProgressEvent } from "../types.js";

function createMockSource(documents: Document[]): IngestSource {
  return {
    name: "mock",
    async load() {
      return documents;
    },
  };
}

function createMockStrategy(): ChunkStrategy {
  return {
    name: "mock",
    chunk(document, opts) {
      const chunkSize = opts?.chunkSize ?? 512;
      const estimatedTokens = Math.ceil(document.content.length / 4);

      if (estimatedTokens <= chunkSize) {
        return [{
          id: `${document.id}_0`,
          content: document.content,
          chunkIndex: 0,
          chunkCount: 1,
          metadata: { ...document.metadata },
        }];
      }

      // Split into 2 chunks for testing
      const mid = Math.floor(document.content.length / 2);
      return [
        {
          id: `${document.id}_0`,
          content: document.content.slice(0, mid),
          chunkIndex: 0,
          chunkCount: 2,
          metadata: { ...document.metadata },
        },
        {
          id: `${document.id}_1`,
          content: document.content.slice(mid),
          chunkIndex: 1,
          chunkCount: 2,
          metadata: { ...document.metadata },
        },
      ];
    },
  };
}

function createMockEmbedder(dims = 4): EmbeddingProvider {
  return {
    name: "mock",
    dimensions: dims,
    async embed() {
      return Array.from({ length: dims }, () => Math.random());
    },
    async embedBatch(texts) {
      return texts.map(() => Array.from({ length: dims }, () => Math.random()));
    },
  };
}

function createMockAdapter(): OutputAdapter & { written: unknown[][] } {
  const written: unknown[][] = [];
  return {
    name: "mock",
    written,
    async init() {},
    async write(chunks) {
      written.push(chunks);
    },
    async close() {},
  };
}

const sampleDocuments: Document[] = [
  {
    id: "doc1",
    content: "This is the first document with some content about data pipelines.",
    metadata: { source: "test/doc1.txt", type: "file" },
  },
  {
    id: "doc2",
    content: "This is the second document about embeddings and vector stores.",
    metadata: { source: "test/doc2.txt", type: "file" },
  },
];

describe("orchestrator", () => {
  it("runs a complete pipeline with all four stages", async () => {
    const adapter = createMockAdapter();

    const result = await runPipeline({
      source: createMockSource(sampleDocuments),
      strategy: createMockStrategy(),
      embedder: createMockEmbedder(),
      adapter,
      config: {
        sourcePath: "./test",
        sourceType: "file",
        chunkStrategy: "mock",
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingProvider: "mock",
        embeddingModel: "mock",
        embeddingDimensions: 4,
        embeddingBatchSize: 128,
        outputAdapter: "mock",
        outputFile: "./output/test.jsonl",
      },
    });

    expect(result.documentsIngested).toBe(2);
    expect(result.chunksCreated).toBeGreaterThan(0);
    expect(result.chunksEmbedded).toBe(result.chunksCreated);
    expect(result.chunksIndexed).toBe(result.chunksEmbedded);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(adapter.written.length).toBeGreaterThan(0);
  });

  it("reports progress callbacks", async () => {
    const events: ProgressEvent[] = [];

    await runPipeline({
      source: createMockSource(sampleDocuments),
      strategy: createMockStrategy(),
      embedder: createMockEmbedder(),
      adapter: createMockAdapter(),
      config: {
        sourcePath: "./test",
        sourceType: "file",
        chunkStrategy: "mock",
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingProvider: "mock",
        embeddingModel: "mock",
        embeddingDimensions: 4,
        embeddingBatchSize: 128,
        outputAdapter: "mock",
        outputFile: "./output/test.jsonl",
      },
      onProgress: (event) => events.push(event),
    });

    const stages = new Set(events.map((e) => e.stage));
    expect(stages.has("ingest")).toBe(true);
    expect(stages.has("transform")).toBe(true);
    expect(stages.has("embed")).toBe(true);
    expect(stages.has("index")).toBe(true);
  });

  it("captures per-document errors and continues", async () => {
    const failingStrategy: ChunkStrategy = {
      name: "failing",
      chunk(document) {
        if (document.id === "doc1") {
          throw new Error("Transform error for doc1");
        }
        return [{
          id: `${document.id}_0`,
          content: document.content,
          chunkIndex: 0,
          chunkCount: 1,
          metadata: { ...document.metadata },
        }];
      },
    };

    const result = await runPipeline({
      source: createMockSource(sampleDocuments),
      strategy: failingStrategy,
      embedder: createMockEmbedder(),
      adapter: createMockAdapter(),
      config: {
        sourcePath: "./test",
        sourceType: "file",
        chunkStrategy: "failing",
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingProvider: "mock",
        embeddingModel: "mock",
        embeddingDimensions: 4,
        embeddingBatchSize: 128,
        outputAdapter: "mock",
        outputFile: "./output/test.jsonl",
      },
    });

    // doc1 failed, doc2 succeeded
    expect(result.documentsIngested).toBe(2);
    expect(result.chunksCreated).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].stage).toBe("transform");
    expect(result.errors[0].itemId).toBe("doc1");
  });

  it("handles empty source gracefully", async () => {
    const result = await runPipeline({
      source: createMockSource([]),
      strategy: createMockStrategy(),
      embedder: createMockEmbedder(),
      adapter: createMockAdapter(),
      config: {
        sourcePath: "./empty",
        sourceType: "file",
        chunkStrategy: "mock",
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingProvider: "mock",
        embeddingModel: "mock",
        embeddingDimensions: 4,
        embeddingBatchSize: 128,
        outputAdapter: "mock",
        outputFile: "./output/test.jsonl",
      },
    });

    expect(result.documentsIngested).toBe(0);
    expect(result.chunksCreated).toBe(0);
    expect(result.chunksEmbedded).toBe(0);
    expect(result.chunksIndexed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("continues processing when one document in a batch fails at the source level", async () => {
    // Create a source where one document has content that causes the embedder to fail
    const mixedDocuments: Document[] = [
      {
        id: "good-1",
        content: "This is a healthy document about machine learning fundamentals.",
        metadata: { source: "test/good-1.txt", type: "file" },
      },
      {
        id: "poison",
        content: "TRIGGER_EMBED_FAILURE",
        metadata: { source: "test/poison.txt", type: "file" },
      },
      {
        id: "good-2",
        content: "This is another healthy document about neural network architectures.",
        metadata: { source: "test/good-2.txt", type: "file" },
      },
    ];

    // Create a chunk strategy that passes content through
    const passthroughStrategy: ChunkStrategy = {
      name: "passthrough",
      chunk(document) {
        return [{
          id: `${document.id}_0`,
          content: document.content,
          chunkIndex: 0,
          chunkCount: 1,
          metadata: { ...document.metadata },
        }];
      },
    };

    // Embedder that fails on specific content
    const selectiveEmbedder: EmbeddingProvider = {
      name: "selective",
      dimensions: 4,
      async embed(text) {
        if (text === "TRIGGER_EMBED_FAILURE") {
          throw new Error("Corrupt content: cannot embed");
        }
        return Array.from({ length: 4 }, () => Math.random());
      },
      async embedBatch(texts) {
        // If any text in the batch triggers failure, the whole batch fails
        // (this matches real embedding API behavior)
        for (const text of texts) {
          if (text === "TRIGGER_EMBED_FAILURE") {
            throw new Error("Corrupt content in batch: cannot embed");
          }
        }
        return texts.map(() => Array.from({ length: 4 }, () => Math.random()));
      },
    };

    const adapter = createMockAdapter();

    const result = await runPipeline({
      source: createMockSource(mixedDocuments),
      strategy: passthroughStrategy,
      embedder: selectiveEmbedder,
      adapter,
      config: {
        sourcePath: "./test",
        sourceType: "file",
        chunkStrategy: "passthrough",
        chunkSize: 512,
        chunkOverlap: 0,
        embeddingProvider: "selective",
        embeddingModel: "mock",
        embeddingDimensions: 4,
        embeddingBatchSize: 128,
        outputAdapter: "mock",
        outputFile: "./output/test.jsonl",
      },
    });

    // All 3 documents were ingested
    expect(result.documentsIngested).toBe(3);
    // All 3 were chunked
    expect(result.chunksCreated).toBe(3);
    // The entire batch failed at embed because they're in one batch
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.stage === "embed")).toBe(true);
    expect(result.errors.some((e) => e.message.includes("Corrupt content"))).toBe(true);
  });

  it("isolates per-document transform errors without affecting other documents", async () => {
    // One document fails during chunking, the others succeed and complete the pipeline
    const documents: Document[] = [
      {
        id: "healthy-a",
        content: "First document processes without issues.",
        metadata: { source: "a.txt", type: "file" },
      },
      {
        id: "broken",
        content: "This will break.",
        metadata: { source: "broken.txt", type: "file" },
      },
      {
        id: "healthy-b",
        content: "Third document also processes without issues.",
        metadata: { source: "b.txt", type: "file" },
      },
    ];

    const failOnBrokenStrategy: ChunkStrategy = {
      name: "fail-on-broken",
      chunk(document) {
        if (document.id === "broken") {
          throw new Error("Malformed document: missing required section");
        }
        return [{
          id: `${document.id}_0`,
          content: document.content,
          chunkIndex: 0,
          chunkCount: 1,
          metadata: { ...document.metadata },
        }];
      },
    };

    const adapter = createMockAdapter();
    const progressEvents: ProgressEvent[] = [];

    const result = await runPipeline({
      source: createMockSource(documents),
      strategy: failOnBrokenStrategy,
      embedder: createMockEmbedder(),
      adapter,
      config: {
        sourcePath: "./test",
        sourceType: "file",
        chunkStrategy: "fail-on-broken",
        chunkSize: 512,
        chunkOverlap: 0,
        embeddingProvider: "mock",
        embeddingModel: "mock",
        embeddingDimensions: 4,
        embeddingBatchSize: 128,
        outputAdapter: "mock",
        outputFile: "./output/test.jsonl",
      },
      onProgress: (event) => progressEvents.push(event),
    });

    // All 3 documents ingested
    expect(result.documentsIngested).toBe(3);
    // Only 2 documents produced chunks (the broken one was skipped)
    expect(result.chunksCreated).toBe(2);
    // The 2 good chunks were embedded and indexed
    expect(result.chunksEmbedded).toBe(2);
    expect(result.chunksIndexed).toBe(2);
    // Exactly 1 error recorded at the transform stage
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe("transform");
    expect(result.errors[0].itemId).toBe("broken");
    expect(result.errors[0].message).toContain("Malformed document");
    // Output adapter received the 2 good chunks
    expect(adapter.written.length).toBeGreaterThan(0);
    // Progress events should cover all stages
    const stages = new Set(progressEvents.map((e) => e.stage));
    expect(stages.has("ingest")).toBe(true);
    expect(stages.has("transform")).toBe(true);
    expect(stages.has("embed")).toBe(true);
    expect(stages.has("index")).toBe(true);
  });

  it("captures embedding failures per batch", async () => {
    const failingEmbedder: EmbeddingProvider = {
      name: "failing",
      dimensions: 4,
      async embed() {
        throw new Error("Embed error");
      },
      async embedBatch() {
        throw new Error("Batch embed error");
      },
    };

    const result = await runPipeline({
      source: createMockSource(sampleDocuments),
      strategy: createMockStrategy(),
      embedder: failingEmbedder,
      adapter: createMockAdapter(),
      config: {
        sourcePath: "./test",
        sourceType: "file",
        chunkStrategy: "mock",
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingProvider: "failing",
        embeddingModel: "mock",
        embeddingDimensions: 4,
        embeddingBatchSize: 128,
        outputAdapter: "mock",
        outputFile: "./output/test.jsonl",
      },
    });

    expect(result.chunksEmbedded).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].stage).toBe("embed");
  });
});
