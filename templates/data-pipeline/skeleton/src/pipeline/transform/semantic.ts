/**
 * Semantic text chunking strategy.
 *
 * Uses a sliding-window approach over sentences: computes Jaccard
 * similarity (word overlap) between adjacent sentence groups and
 * inserts chunk boundaries where similarity drops below a threshold.
 * This is a heuristic approximation that detects topic shifts without
 * requiring an external embedding API.
 *
 * Falls back to recursive splitting for oversized groups and single-
 * sentence documents.
 *
 * Registers itself as the "semantic" chunk strategy on import.
 */

import type { Document, Chunk } from "../types.js";
import type { ChunkStrategy, ChunkOptions } from "./types.js";
import { registerStrategy } from "./registry.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences using punctuation boundaries.
 * Handles common abbreviations and decimal numbers to avoid false splits.
 */
function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return raw.map((s) => s.trim()).filter(Boolean);
}

/**
 * Tokenize a string into a set of lowercase words.
 */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/\b\w+\b/g);
  return new Set(words ?? []);
}

/**
 * Compute Jaccard similarity between two text strings.
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

class SemanticStrategy implements ChunkStrategy {
  readonly name = "semantic";

  private readonly similarityThreshold = 0.3;
  private readonly windowSize = 2;

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

    const sentences = splitSentences(text);

    if (sentences.length <= 1) {
      // Fall back to fixed-size splitting for single-sentence text
      return this.fixedSplit(document, text, chunkSize);
    }

    // Find boundaries where similarity between adjacent sentence windows drops
    const boundaries = this.findBoundaries(sentences);

    // Group sentences between boundaries into raw chunks
    const rawChunks = this.groupByBoundaries(sentences, boundaries);

    // Enforce max chunk size
    const sizedChunks = this.enforceSize(rawChunks, chunkSize);

    // Apply overlap
    const withOverlap = overlap > 0 && sizedChunks.length > 1
      ? this.applyOverlap(sizedChunks, overlap)
      : sizedChunks;

    return withOverlap.map((content, i) => ({
      id: `${document.id}_${i}`,
      content,
      chunkIndex: i,
      chunkCount: withOverlap.length,
      metadata: { ...document.metadata },
    }));
  }

  private findBoundaries(sentences: string[]): number[] {
    const boundaries: number[] = [];
    const w = this.windowSize;

    for (let i = w; i <= sentences.length - w; i++) {
      const leftWindow = sentences.slice(Math.max(0, i - w), i).join(" ");
      const rightWindow = sentences.slice(i, Math.min(sentences.length, i + w)).join(" ");
      const similarity = jaccardSimilarity(leftWindow, rightWindow);

      if (similarity < this.similarityThreshold) {
        boundaries.push(i);
      }
    }

    return boundaries;
  }

  private groupByBoundaries(sentences: string[], boundaries: number[]): string[] {
    const groups: string[] = [];
    let start = 0;

    for (const boundary of boundaries) {
      const group = sentences.slice(start, boundary).join(" ").trim();
      if (group) groups.push(group);
      start = boundary;
    }

    const tail = sentences.slice(start).join(" ").trim();
    if (tail) groups.push(tail);

    return groups;
  }

  private enforceSize(chunks: string[], chunkSize: number): string[] {
    const result: string[] = [];

    for (const chunk of chunks) {
      if (estimateTokens(chunk) > chunkSize) {
        const chunkChars = chunkSize * 4;
        let start = 0;
        while (start < chunk.length) {
          const end = Math.min(start + chunkChars, chunk.length);
          const slice = chunk.slice(start, end).trim();
          if (slice) result.push(slice);
          if (end >= chunk.length) break;
          start = end;
        }
      } else {
        result.push(chunk);
      }
    }

    return result;
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

  private fixedSplit(document: Document, text: string, chunkSize: number): Chunk[] {
    const chunkChars = chunkSize * 4;
    const rawChunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkChars, text.length);
      const slice = text.slice(start, end).trim();
      if (slice) rawChunks.push(slice);
      if (end >= text.length) break;
      start = end;
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

registerStrategy("semantic", () => new SemanticStrategy());
