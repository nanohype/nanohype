// ── Vector Similarity ───────────────────────────────────────────────
//
// Pure math utilities for comparing embedding vectors. Cosine
// similarity is the standard metric for semantic search — it measures
// the angle between two vectors, ignoring magnitude. A score of 1
// means identical direction, 0 means orthogonal, -1 means opposite.
//

/**
 * Compute the cosine similarity between two vectors.
 *
 * Returns a value between -1 and 1. Throws if vectors have different
 * lengths. Returns 0 if either vector has zero magnitude (consistent
 * with module-vector-store behavior).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) return 0;

  return dot / magnitude;
}

/**
 * Normalize a vector to unit length (L2 norm = 1).
 *
 * Returns a new array. Throws if the input is a zero vector.
 */
export function normalize(v: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) {
    sumSq += v[i] * v[i];
  }

  const norm = Math.sqrt(sumSq);

  if (norm === 0) {
    throw new Error("Cannot normalize a zero vector");
  }

  return v.map((x) => x / norm);
}
