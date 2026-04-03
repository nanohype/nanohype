// -- Similarity Functions ------------------------------------------------
//
// Pure math utilities for vector similarity computations. Used by the
// in-memory provider for cosine similarity ranking and available to
// consumers for embedding pre-processing.
//

/**
 * Compute the magnitude (L2 norm) of a vector.
 */
export function magnitude(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * Compute the dot product of two vectors.
 * Vectors must have the same length.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Normalize a vector to unit length (L2 normalization).
 * Returns a zero vector if the input has zero magnitude.
 */
export function normalize(v: number[]): number[] {
  const mag = magnitude(v);
  if (mag === 0) return new Array(v.length).fill(0);
  return v.map((x) => x / mag);
}

/**
 * Compute cosine similarity between two vectors.
 *
 * Returns a value in [-1, 1]:
 *   1  = identical direction
 *   0  = orthogonal (unrelated)
 *  -1  = opposite direction
 *
 * Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  const magA = magnitude(a);
  const magB = magnitude(b);

  if (magA === 0 || magB === 0) return 0;

  return dotProduct(a, b) / (magA * magB);
}
