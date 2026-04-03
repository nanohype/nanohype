/**
 * Recursive text chunking strategy.
 *
 * Splits text by recursively trying separators from coarse to fine:
 * paragraph breaks → newlines → sentences → words. Preserves natural
 * text boundaries while staying within the target chunk size. Applies
 * configurable overlap between consecutive chunks.
 *
 * Registers itself as the "recursive" chunk strategy on import.
 */

import type { Document, Chunk } from "../types.js";
import type { ChunkStrategy, ChunkOptions } from "./types.js";
import { registerStrategy } from "./registry.js";

const SEPARATORS = ["\n\n", "\n", ". ", " "];

/**
 * Estimate token count using a char/4 heuristic.
 * Avoids a tokenizer dependency while remaining a reasonable
 * approximation for English text with GPT-style tokenizers.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

class RecursiveStrategy implements ChunkStrategy {
  readonly name = "recursive";

  chunk(document: Document, opts: ChunkOptions = {}): Chunk[] {
    const chunkSize = opts.chunkSize ?? 512;
    const overlap = opts.overlap ?? 64;
    const text = document.content.trim();

    if (!text) return [];

    if (estimateTokens(text) <= chunkSize) {
      return [{
        id: `${document.id}_0`,
        content: text,
        chunkIndex: 0,
        chunkCount: 1,
        metadata: { ...document.metadata },
      }];
    }

    const rawChunks = this.recursiveSplit(text, 0, chunkSize);

    const withOverlap = overlap > 0 && rawChunks.length > 1
      ? this.applyOverlap(rawChunks, overlap)
      : rawChunks;

    return withOverlap.map((content, i) => ({
      id: `${document.id}_${i}`,
      content,
      chunkIndex: i,
      chunkCount: withOverlap.length,
      metadata: { ...document.metadata },
    }));
  }

  private recursiveSplit(text: string, sepIndex: number, chunkSize: number): string[] {
    if (sepIndex >= SEPARATORS.length) {
      // Fallback to fixed-size splitting
      return this.fixedSplit(text, chunkSize);
    }

    const separator = SEPARATORS[sepIndex];
    const parts = text.split(separator);
    const chunks: string[] = [];
    let current = "";

    for (const part of parts) {
      const candidate = current ? `${current}${separator}${part}` : part;

      if (estimateTokens(candidate) <= chunkSize) {
        current = candidate;
      } else {
        if (current.trim()) {
          chunks.push(current.trim());
        }

        if (estimateTokens(part) > chunkSize) {
          chunks.push(...this.recursiveSplit(part, sepIndex + 1, chunkSize));
          current = "";
        } else {
          current = part;
        }
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  private fixedSplit(text: string, chunkSize: number): string[] {
    const chunkChars = chunkSize * 4;
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkChars, text.length);
      const slice = text.slice(start, end).trim();
      if (slice) chunks.push(slice);
      if (end >= text.length) break;
      start = end;
    }

    return chunks;
  }

  private applyOverlap(chunks: string[], overlap: number): string[] {
    const overlapChars = overlap * 4;
    const result = [chunks[0]];

    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlapText = prev.slice(-overlapChars);
      result.push(`${overlapText} ${chunks[i]}`);
    }

    return result;
  }
}

registerStrategy("recursive", () => new RecursiveStrategy());
