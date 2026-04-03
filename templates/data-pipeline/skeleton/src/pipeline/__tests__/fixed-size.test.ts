/**
 * Tests for the fixed-size chunking strategy.
 *
 * Verifies character-based splitting, overlap, approximate chunk
 * sizes, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { getStrategy } from "../transform/index.js";
import type { Document } from "../types.js";

function makeDoc(content: string, id = "test-doc"): Document {
  return { id, content, metadata: { source: "test" } };
}

const LONG_TEXT = "A".repeat(4000); // ~1000 tokens at char/4 heuristic
const SHORT_TEXT = "Short text for testing.";

describe("fixed-size chunking strategy", () => {
  it("is registered and retrievable", () => {
    const strategy = getStrategy("fixed");
    expect(strategy.name).toBe("fixed");
  });

  it("returns short text as a single chunk", () => {
    const strategy = getStrategy("fixed");
    const chunks = strategy.chunk(makeDoc(SHORT_TEXT), { chunkSize: 512, overlap: 64 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(SHORT_TEXT);
  });

  it("produces multiple chunks for long text", () => {
    const strategy = getStrategy("fixed");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize: 50, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("respects approximate chunk size", () => {
    const chunkSize = 50;
    const strategy = getStrategy("fixed");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize, overlap: 0 });

    for (const chunk of chunks) {
      // Each chunk should be at most chunkSize*4 characters
      expect(chunk.content.length).toBeLessThanOrEqual(chunkSize * 4);
    }
  });

  it("preserves all content without overlap", () => {
    const strategy = getStrategy("fixed");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize: 50, overlap: 0 });
    const reconstructed = chunks.map((c) => c.content).join("");
    expect(reconstructed).toBe(LONG_TEXT);
  });

  it("handles empty text", () => {
    const strategy = getStrategy("fixed");
    const chunks = strategy.chunk(makeDoc(""), { chunkSize: 50, overlap: 10 });
    expect(chunks).toHaveLength(0);
  });

  it("assigns sequential chunk IDs", () => {
    const strategy = getStrategy("fixed");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT, "my-doc"), { chunkSize: 100, overlap: 0 });

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].id).toBe(`my-doc_${i}`);
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].chunkCount).toBe(chunks.length);
    }
  });

  it("produces overlapping chunks when overlap > 0", () => {
    const strategy = getStrategy("fixed");
    const chunks = strategy.chunk(makeDoc(LONG_TEXT), { chunkSize: 100, overlap: 20 });

    if (chunks.length > 1) {
      // With overlap, total characters across chunks should exceed original length
      const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
      expect(totalChars).toBeGreaterThan(LONG_TEXT.length);
    }
  });

  it("carries forward document metadata", () => {
    const strategy = getStrategy("fixed");
    const doc = makeDoc(SHORT_TEXT);
    doc.metadata = { source: "test.csv", format: "csv" };
    const chunks = strategy.chunk(doc, { chunkSize: 512 });

    expect(chunks[0].metadata.source).toBe("test.csv");
    expect(chunks[0].metadata.format).toBe("csv");
  });
});
