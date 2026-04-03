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
