/**
 * Assertion helpers for pipeline evaluation.
 *
 * Each returns a { pass, message } result instead of throwing, so the runner
 * can collect every result for a case and print a summary rather than stopping
 * at the first one that fails.
 *
 * What a case asserts over is the split and the vectors it was embedded into:
 * where the boundaries landed, what survived into a chunk, and which chunk a
 * probe is nearest. Those are the outputs a consumer indexes, so they are the
 * outputs worth asserting on.
 */

import type { Chunk } from "../types.js";
import type { CaseAssertion } from "./cases.js";

export interface AssertionResult {
  pass: boolean;
  message: string;
}

/** What one case produced: the split, and the vectors the chunks embed to. */
export interface ChunkedOutput {
  chunks: Chunk[];
  embeddings: number[][];
  /** Dimensionality the embedding provider declares. */
  dimensions: number;
}

/** Embeds a probe, so a case can ask which chunk the probe is nearest. */
export type EmbedProbe = (text: string) => Promise<number[]>;

function result(pass: boolean, message: string, why?: string): AssertionResult {
  return { pass, message: pass || !why ? message : `${message} — ${why}` };
}

/** Index of the first chunk containing `text`, or -1. */
export function firstChunkContaining(chunks: Chunk[], text: string): number {
  return chunks.findIndex((chunk) => chunk.content.includes(text));
}

/** Cosine similarity between two vectors of equal length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/** Index of the chunk whose vector is nearest `probe`, or -1 for no chunks. */
export function nearestChunkIndex(output: ChunkedOutput, probe: number[]): number {
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < output.embeddings.length; i++) {
    const score = cosineSimilarity(probe, output.embeddings[i]);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Check one assertion against a case's output.
 *
 * `embed` is only called by assertions that compare a probe against the
 * vectors, so a corpus that asserts nothing about retrieval costs no extra
 * provider calls.
 */
export async function checkAssertion(
  assertion: CaseAssertion,
  output: ChunkedOutput,
  embed: EmbedProbe,
): Promise<AssertionResult> {
  const { chunks, embeddings } = output;
  const why = assertion.why;

  switch (assertion.type) {
    case "chunk_count_between": {
      const [min, max] = assertion.value;
      const n = chunks.length;
      return result(
        n >= min && n <= max,
        `Split into ${n} chunk(s), expected between ${min} and ${max}`,
        why,
      );
    }

    case "split_between": {
      const [left, right] = assertion.value;
      const a = firstChunkContaining(chunks, left);
      const b = firstChunkContaining(chunks, right);
      if (a === -1 || b === -1) {
        return result(
          false,
          `Cannot place a boundary: "${a === -1 ? left : right}" is in no chunk`,
          why,
        );
      }
      return result(a !== b, `"${left}" is in chunk ${a}, "${right}" in chunk ${b}`, why);
    }

    case "kept_together": {
      const [left, right] = assertion.value;
      const a = firstChunkContaining(chunks, left);
      const b = firstChunkContaining(chunks, right);
      if (a === -1 || b === -1) {
        return result(false, `Cannot compare: "${a === -1 ? left : right}" is in no chunk`, why);
      }
      return result(a === b, `"${left}" is in chunk ${a}, "${right}" in chunk ${b}`, why);
    }

    case "text_preserved": {
      const at = firstChunkContaining(chunks, assertion.value);
      return result(
        at !== -1,
        at === -1
          ? `"${assertion.value}" survived into no chunk`
          : `"${assertion.value}" is in chunk ${at}`,
        why,
      );
    }

    case "no_chunk_matches": {
      const pattern = new RegExp(assertion.value);
      const at = chunks.findIndex((chunk) => pattern.test(chunk.content));
      return result(
        at === -1,
        at === -1 ? `No chunk matches ${pattern}` : `Chunk ${at} matches ${pattern}`,
        why,
      );
    }

    case "max_chunk_chars": {
      const longest = chunks.reduce((max, chunk) => Math.max(max, chunk.content.length), 0);
      return result(
        longest <= assertion.value,
        `Longest chunk is ${longest} character(s), limit ${assertion.value}`,
        why,
      );
    }

    case "every_chunk_embedded": {
      if (chunks.length === 0) {
        return result(false, "No chunks, so nothing was embedded", why);
      }
      if (embeddings.length !== chunks.length) {
        return result(
          false,
          `${chunks.length} chunk(s) produced ${embeddings.length} vector(s)`,
          why,
        );
      }
      const bad = embeddings.findIndex(
        (vector) => vector.length !== output.dimensions || vector.some((v) => !Number.isFinite(v)),
      );
      return result(
        bad === -1,
        bad === -1
          ? `All ${chunks.length} chunk(s) carry a ${output.dimensions}-dimension vector`
          : `Chunk ${bad} has no usable vector`,
        why,
      );
    }

    case "nearest_chunk": {
      const [probe, expected] = assertion.value;
      const at = nearestChunkIndex(output, await embed(probe));
      if (at === -1) {
        return result(false, `Nothing to retrieve: the document produced no chunks`, why);
      }
      return result(
        chunks[at].content.includes(expected),
        `Chunk ${at} is nearest "${probe}"; it ${chunks[at].content.includes(expected) ? "contains" : "does not contain"} "${expected}"`,
        why,
      );
    }

    default: {
      // A case file is JSON and JSON does not honour a union, so a type outside
      // the declared set arrives here at run time. Without this arm it produces
      // no result, and `every` over an empty list is true — the case passes
      // having checked nothing.
      const unknown = assertion as { type: string };
      return result(false, `Unknown assertion type "${unknown.type}" — nothing checks it`, why);
    }
  }
}
