/**
 * Text chunking strategies.
 *
 * Provides multiple approaches for splitting documents into chunks suitable
 * for embedding and retrieval. Each strategy implements the ChunkingStrategy
 * interface so they can be swapped via configuration.
 *
 * Strategies:
 * - fixed    -- split by approximate token count with overlap, using a
 *               char/4 heuristic for token estimation.
 * - recursive -- split by characters using a hierarchy of separators
 *               (paragraphs, sentences, words), preserving natural boundaries.
 * - semantic -- placeholder for sentence-level semantic chunking.
 *               Falls back to recursive splitting.
 */

import type { ChunkingConfig } from "./config.js";

export interface Chunk {
  content: string;
  metadata: Record<string, unknown>;
}

export interface ChunkingStrategy {
  chunk(text: string, metadata?: Record<string, unknown>): Chunk[];
}

/**
 * Estimate token count using a char/4 heuristic.
 * This avoids a tokenizer dependency while remaining a reasonable
 * approximation for English text with GPT-style tokenizers.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into fixed-size chunks by approximate token count.
 *
 * Groups characters into chunks targeting `chunkSize` tokens with
 * `overlap` tokens shared between consecutive chunks. This guarantees
 * consistent chunk sizes but may split mid-word or mid-sentence.
 */
export class FixedChunker implements ChunkingStrategy {
  private readonly chunkSize: number;
  private readonly overlap: number;

  constructor(chunkSize = 512, overlap = 64) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  chunk(text: string, metadata: Record<string, unknown> = {}): Chunk[] {
    const totalTokens = estimateTokens(text);

    if (totalTokens <= this.chunkSize) {
      return [{ content: text, metadata }];
    }

    const chunkChars = this.chunkSize * 4;
    const overlapChars = this.overlap * 4;
    const chunks: Chunk[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkChars, text.length);
      chunks.push({
        content: text.slice(start, end),
        metadata: { ...metadata, chunkIndex: chunks.length },
      });

      if (end >= text.length) break;
      start += chunkChars - overlapChars;
    }

    return chunks;
  }
}

/**
 * Split text by recursively trying separators from coarse to fine.
 *
 * Attempts to split on paragraph breaks first, then newlines, then
 * sentences, then words. This preserves natural text boundaries while
 * staying within the target chunk size.
 */
export class RecursiveChunker implements ChunkingStrategy {
  private static readonly SEPARATORS = ["\n\n", "\n", ". ", " "];
  private readonly chunkSize: number;
  private readonly overlap: number;

  constructor(chunkSize = 512, overlap = 64) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  chunk(text: string, metadata: Record<string, unknown> = {}): Chunk[] {
    if (estimateTokens(text) <= this.chunkSize) {
      const trimmed = text.trim();
      return trimmed ? [{ content: trimmed, metadata }] : [];
    }

    const rawChunks = this.recursiveSplit(text, 0);

    const withOverlap = this.overlap > 0 && rawChunks.length > 1
      ? this.applyOverlap(rawChunks)
      : rawChunks;

    return withOverlap.map((content, i) => ({
      content,
      metadata: { ...metadata, chunkIndex: i },
    }));
  }

  private recursiveSplit(text: string, sepIndex: number): string[] {
    if (sepIndex >= RecursiveChunker.SEPARATORS.length) {
      return new FixedChunker(this.chunkSize, this.overlap)
        .chunk(text)
        .map((c) => c.content);
    }

    const separator = RecursiveChunker.SEPARATORS[sepIndex];
    const parts = text.split(separator);
    const chunks: string[] = [];
    let current = "";

    for (const part of parts) {
      const candidate = current ? `${current}${separator}${part}` : part;

      if (estimateTokens(candidate) <= this.chunkSize) {
        current = candidate;
      } else {
        if (current.trim()) {
          chunks.push(current.trim());
        }

        if (estimateTokens(part) > this.chunkSize) {
          chunks.push(...this.recursiveSplit(part, sepIndex + 1));
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

  private applyOverlap(chunks: string[]): string[] {
    const overlapChars = this.overlap * 4;
    const result = [chunks[0]];

    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlapText = prev.slice(-overlapChars);
      result.push(`${overlapText} ${chunks[i]}`);
    }

    return result;
  }
}

/**
 * Semantic chunking based on content similarity.
 *
 * Uses a sliding-window approach over sentences: computes Jaccard similarity
 * (word overlap) between adjacent sentence groups and inserts chunk boundaries
 * where similarity drops below a threshold. This is a heuristic approximation
 * that detects topic shifts without requiring an external embedding API.
 *
 * Respects chunk size constraints (max tokens, overlap) by merging small
 * sentence groups and splitting oversized ones via RecursiveChunker.
 */
export class SemanticChunker implements ChunkingStrategy {
  private readonly chunkSize: number;
  private readonly overlap: number;
  private readonly similarityThreshold: number;
  private readonly windowSize: number;

  constructor(chunkSize = 512, overlap = 64, similarityThreshold = 0.3, windowSize = 2) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
    this.similarityThreshold = similarityThreshold;
    this.windowSize = windowSize;
  }

  chunk(text: string, metadata: Record<string, unknown> = {}): Chunk[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (estimateTokens(trimmed) <= this.chunkSize) {
      return [{ content: trimmed, metadata }];
    }

    const sentences = splitSentences(trimmed);

    if (sentences.length <= 1) {
      return new RecursiveChunker(this.chunkSize, this.overlap).chunk(text, metadata);
    }

    // Find boundaries where similarity between adjacent sentence windows drops
    const boundaries = this.findBoundaries(sentences);

    // Group sentences between boundaries into raw chunks
    const rawChunks = this.groupByBoundaries(sentences, boundaries);

    // Enforce max chunk size: split oversized groups via RecursiveChunker
    const sizedChunks = this.enforceSize(rawChunks);

    // Apply overlap between consecutive chunks
    const withOverlap = this.overlap > 0 && sizedChunks.length > 1
      ? this.applyOverlap(sizedChunks)
      : sizedChunks;

    return withOverlap.map((content, i) => ({
      content,
      metadata: { ...metadata, chunkIndex: i },
    }));
  }

  /**
   * Compute boundaries by comparing adjacent sliding windows of sentences.
   * A boundary is inserted at position i when the Jaccard similarity between
   * the window ending at sentence i-1 and the window starting at sentence i
   * falls below the threshold.
   */
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

  /**
   * Split sentence array at the given boundary indices into groups.
   */
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

  /**
   * Split any chunk that exceeds the max token size using RecursiveChunker.
   */
  private enforceSize(chunks: string[]): string[] {
    const result: string[] = [];
    const fallback = new RecursiveChunker(this.chunkSize, 0);

    for (const chunk of chunks) {
      if (estimateTokens(chunk) > this.chunkSize) {
        result.push(...fallback.chunk(chunk).map((c) => c.content));
      } else {
        result.push(chunk);
      }
    }

    return result;
  }

  private applyOverlap(chunks: string[]): string[] {
    const overlapChars = this.overlap * 4;
    const result = [chunks[0]];

    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlapText = prev.slice(-overlapChars);
      result.push(`${overlapText} ${chunks[i]}`);
    }

    return result;
  }
}

/**
 * Split text into sentences using punctuation boundaries.
 * Handles common abbreviations and decimal numbers to avoid false splits.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace and an uppercase letter
  // or end-of-string. This avoids splitting on abbreviations like "e.g." or "Dr."
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return raw.map((s) => s.trim()).filter(Boolean);
}

/**
 * Compute Jaccard similarity between two text strings.
 * Tokenizes on word boundaries, lowercases, and computes
 * |intersection| / |union| of the two token sets.
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

/**
 * Tokenize a string into a set of lowercase words.
 */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/\b\w+\b/g);
  return new Set(words ?? []);
}

/**
 * Factory: create a chunker from configuration.
 */
export function createChunker(config: ChunkingConfig): ChunkingStrategy {
  const strategy = config.strategy.toLowerCase();

  switch (strategy) {
    case "fixed":
      return new FixedChunker(config.size, config.overlap);
    case "recursive":
      return new RecursiveChunker(config.size, config.overlap);
    case "semantic":
      return new SemanticChunker(config.size, config.overlap);
    default:
      throw new Error(
        `Unknown chunking strategy: "${strategy}". Expected one of: fixed, recursive, semantic`,
      );
  }
}
