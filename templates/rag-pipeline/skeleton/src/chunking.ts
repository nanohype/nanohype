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
 * This is a reference stub that falls back to recursive splitting.
 * A full implementation would:
 *
 * 1. Split text into sentences
 * 2. Embed each sentence
 * 3. Find boundaries where consecutive sentence embeddings diverge
 *    beyond a threshold
 * 4. Group sentences between boundaries into chunks
 *
 * For now, this delegates to RecursiveChunker so the pipeline
 * works end-to-end while you implement the semantic logic.
 */
export class SemanticChunker implements ChunkingStrategy {
  private readonly fallback: RecursiveChunker;

  constructor(chunkSize = 512, overlap = 64) {
    this.fallback = new RecursiveChunker(chunkSize, overlap);
  }

  chunk(text: string, metadata: Record<string, unknown> = {}): Chunk[] {
    return this.fallback.chunk(text, metadata);
  }
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
