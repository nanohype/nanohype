/**
 * Fixed-size text chunking strategy.
 *
 * Splits text into chunks of approximately equal character count with
 * configurable overlap. Uses a char/4 heuristic for token estimation.
 * Simple and predictable, but may split mid-word or mid-sentence.
 *
 * Registers itself as the "fixed" chunk strategy on import.
 */

import type { Document, Chunk } from "../types.js";
import type { ChunkStrategy, ChunkOptions } from "./types.js";
import { registerStrategy } from "./registry.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

class FixedSizeStrategy implements ChunkStrategy {
  readonly name = "fixed";

  chunk(document: Document, opts: ChunkOptions = {}): Chunk[] {
    const chunkSize = opts.chunkSize ?? 512;
    const overlap = opts.overlap ?? 64;
    const text = document.content;

    if (!text.trim()) return [];

    if (estimateTokens(text) <= chunkSize) {
      return [{
        id: `${document.id}_0`,
        content: text,
        chunkIndex: 0,
        chunkCount: 1,
        metadata: { ...document.metadata },
      }];
    }

    const chunkChars = chunkSize * 4;
    const overlapChars = overlap * 4;
    const rawChunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkChars, text.length);
      rawChunks.push(text.slice(start, end));
      if (end >= text.length) break;
      start += chunkChars - overlapChars;
    }

    return rawChunks.map((content, i) => ({
      id: `${document.id}_${i}`,
      content,
      chunkIndex: i,
      chunkCount: rawChunks.length,
      metadata: { ...document.metadata },
    }));
  }
}

registerStrategy("fixed", () => new FixedSizeStrategy());
