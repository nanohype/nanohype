/**
 * Tests for the chunking module.
 *
 * Verifies that each chunking strategy correctly splits text into chunks
 * of the expected size and count, and that content is preserved through
 * the splitting process.
 */

import { describe, it, expect } from "vitest";
import {
  FixedChunker,
  RecursiveChunker,
  SemanticChunker,
  createChunker,
} from "../chunking.js";

const SAMPLE_TEXT = [
  "Retrieval-Augmented Generation (RAG) is an approach that combines ",
  "information retrieval with text generation. The system first retrieves ",
  "relevant documents from a knowledge base, then uses those documents as ",
  "context when generating a response.\n\n",
  "The retrieval step typically involves embedding both the query and the ",
  "documents into a shared vector space, then finding the nearest neighbors ",
  "to the query vector. This allows the system to find semantically similar ",
  "content even when the exact words differ.\n\n",
  "The generation step takes the retrieved documents and the original query, ",
  "constructs a prompt, and sends it to a large language model. The model ",
  "produces an answer grounded in the retrieved evidence, which reduces ",
  "hallucination and provides traceable sources.\n\n",
  "RAG pipelines can be configured with different chunking strategies, ",
  "embedding models, and vector stores depending on the use case. Fixed-size ",
  "chunking is simple but may split sentences. Recursive chunking tries to ",
  "respect natural text boundaries. Semantic chunking uses embeddings to ",
  "detect topic shifts.",
].join("");

const SHORT_TEXT = "This is a short text that fits in a single chunk.";

describe("FixedChunker", () => {
  it("returns short text as a single chunk", () => {
    const chunker = new FixedChunker(512, 64);
    const chunks = chunker.chunk(SHORT_TEXT);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(SHORT_TEXT);
  });

  it("produces multiple chunks for long text", () => {
    const chunker = new FixedChunker(50, 10);
    const chunks = chunker.chunk(SAMPLE_TEXT);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("respects approximate chunk size", () => {
    const chunkSize = 50;
    const chunker = new FixedChunker(chunkSize, 10);
    const chunks = chunker.chunk(SAMPLE_TEXT);

    for (const chunk of chunks) {
      // Using char/4 heuristic, each chunk should be roughly chunkSize*4 chars
      const estimatedTokens = Math.ceil(chunk.content.length / 4);
      // Allow some slack for the last chunk and overlap
      expect(estimatedTokens).toBeLessThanOrEqual(chunkSize + 10);
    }
  });

  it("preserves all content", () => {
    const chunker = new FixedChunker(50, 0);
    const chunks = chunker.chunk(SAMPLE_TEXT);

    // With no overlap, concatenating chunks should reconstruct the original
    const reconstructed = chunks.map((c) => c.content).join("");
    expect(reconstructed).toBe(SAMPLE_TEXT);
  });

  it("handles empty text", () => {
    const chunker = new FixedChunker(50, 10);
    const chunks = chunker.chunk("");
    expect(chunks).toHaveLength(1);
  });
});

describe("RecursiveChunker", () => {
  it("returns short text as a single chunk", () => {
    const chunker = new RecursiveChunker(512, 0);
    const chunks = chunker.chunk(SHORT_TEXT);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(SHORT_TEXT);
  });

  it("splits on paragraph boundaries", () => {
    const chunker = new RecursiveChunker(80, 0);
    const chunks = chunker.chunk(SAMPLE_TEXT);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("preserves content words", () => {
    const chunker = new RecursiveChunker(80, 0);
    const chunks = chunker.chunk(SAMPLE_TEXT);

    const originalWords = new Set(SAMPLE_TEXT.split(/\s+/));
    const chunkWords = new Set(chunks.flatMap((c) => c.content.split(/\s+/)));

    const missing = [...originalWords].filter((w) => !chunkWords.has(w));
    expect(missing.length / originalWords.size).toBeLessThan(0.05);
  });

  it("returns no chunks for empty text", () => {
    const chunker = new RecursiveChunker(50, 0);
    const chunks = chunker.chunk("");
    expect(chunks).toHaveLength(0);
  });

  it("returns no chunks for whitespace-only text", () => {
    const chunker = new RecursiveChunker(50, 0);
    const chunks = chunker.chunk("   \n\n   ");
    expect(chunks).toHaveLength(0);
  });
});

describe("SemanticChunker", () => {
  it("produces chunks for long text", () => {
    const chunker = new SemanticChunker(80, 0);
    const chunks = chunker.chunk(SAMPLE_TEXT);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("returns short text as a single chunk", () => {
    const chunker = new SemanticChunker(512, 0);
    const chunks = chunker.chunk(SHORT_TEXT);
    expect(chunks).toHaveLength(1);
  });
});

describe("createChunker", () => {
  it("creates a FixedChunker for 'fixed' strategy", () => {
    const chunker = createChunker({ strategy: "fixed", size: 100, overlap: 10 });
    expect(chunker).toBeInstanceOf(FixedChunker);
  });

  it("creates a RecursiveChunker for 'recursive' strategy", () => {
    const chunker = createChunker({ strategy: "recursive", size: 100, overlap: 10 });
    expect(chunker).toBeInstanceOf(RecursiveChunker);
  });

  it("creates a SemanticChunker for 'semantic' strategy", () => {
    const chunker = createChunker({ strategy: "semantic", size: 100, overlap: 10 });
    expect(chunker).toBeInstanceOf(SemanticChunker);
  });

  it("throws on unknown strategy", () => {
    expect(() => createChunker({ strategy: "unknown", size: 100, overlap: 10 })).toThrow(
      "Unknown chunking strategy",
    );
  });
});
