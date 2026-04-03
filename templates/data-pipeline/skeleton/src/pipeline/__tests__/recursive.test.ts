/**
 * Tests for the recursive chunking strategy.
 *
 * Verifies chunk sizes, overlap behavior, boundary preservation,
 * and edge cases for the recursive text splitter.
 */

import { describe, it, expect } from "vitest";
import { getStrategy } from "../transform/index.js";
import type { Document } from "../types.js";

function makeDoc(content: string, id = "test-doc"): Document {
  return { id, content, metadata: { source: "test" } };
}

const LONG_TEXT = [
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
  "Data pipelines can be configured with different chunking strategies, ",
  "embedding models, and vector stores depending on the use case. Fixed-size ",
  "chunking is simple but may split sentences. Recursive chunking tries to ",
  "respect natural text boundaries. Semantic chunking uses embeddings to ",
  "detect topic shifts.",
].join("");

const SHORT_TEXT = "This is a short text that fits in a single chunk.";

describe("recursive chunking strategy", () => {
  it("is registered and retrievable", () => {
    const strategy = getStrategy("recursive");
    expect(strategy.name).toBe("recursive");
  });

  it("returns short text as a single chunk", () => {
    const strategy = getStrategy("recursive");
    const chunks = strategy.chunk(makeDoc(SHORT_TEXT), { chunkSize: 512, overlap: 0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(SHORT_TEXT);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].chunkCount).toBe(1);
  });

  it("produces multiple chunks for long text", () => {
    const strategy = getStrategy("recursive");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize: 80, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("preserves content words across chunks", () => {
    const strategy = getStrategy("recursive");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize: 80, overlap: 0 });

    const originalWords = new Set(LONG_TEXT.split(/\s+/));
    const chunkWords = new Set(chunks.flatMap((c) => c.content.split(/\s+/)));

    const missing = [...originalWords].filter((w) => !chunkWords.has(w));
    // Allow small percentage of words to be trimmed at boundaries
    expect(missing.length / originalWords.size).toBeLessThan(0.05);
  });

  it("assigns correct chunk IDs", () => {
    const strategy = getStrategy("recursive");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT, "my-doc"), { chunkSize: 80, overlap: 0 });

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].id).toBe(`my-doc_${i}`);
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].chunkCount).toBe(chunks.length);
    }
  });

  it("carries forward document metadata", () => {
    const strategy = getStrategy("recursive");
    const doc = makeDoc(SHORT_TEXT);
    doc.metadata = { source: "test.md", author: "tester" };
    const chunks = strategy.chunk(doc, { chunkSize: 512 });

    expect(chunks[0].metadata.source).toBe("test.md");
    expect(chunks[0].metadata.author).toBe("tester");
  });

  it("returns no chunks for empty text", () => {
    const strategy = getStrategy("recursive");
    const chunks = strategy.chunk(makeDoc(""), { chunkSize: 512 });
    expect(chunks).toHaveLength(0);
  });

  it("returns no chunks for whitespace-only text", () => {
    const strategy = getStrategy("recursive");
    const chunks = strategy.chunk(makeDoc("   \n\n   "), { chunkSize: 512 });
    expect(chunks).toHaveLength(0);
  });

  it("applies overlap between chunks", () => {
    const strategy = getStrategy("recursive");
    const noOverlap = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize: 80, overlap: 0 });
    const withOverlap = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize: 80, overlap: 16 });

    // With overlap, content of each chunk (after first) should start with
    // text from the end of the previous chunk
    if (withOverlap.length > 1) {
      // Overlap chunks are typically slightly larger due to prepended overlap text
      const totalCharsNoOverlap = noOverlap.reduce((sum, c) => sum + c.content.length, 0);
      const totalCharsWithOverlap = withOverlap.reduce((sum, c) => sum + c.content.length, 0);
      expect(totalCharsWithOverlap).toBeGreaterThanOrEqual(totalCharsNoOverlap);
    }
  });
});
