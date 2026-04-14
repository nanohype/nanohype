import { describe, it, expect } from "vitest";
import { cosineSimilarity, normalize } from "../similarity.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it("returns 1 for parallel vectors with different magnitudes", () => {
    const a = [1, 0, 0];
    const b = [5, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 10);
  });

  it("computes correct similarity for arbitrary vectors", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // dot = 32, |a| = sqrt(14), |b| = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
  });

  it("throws on mismatched vector lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      /length mismatch/,
    );
  });

  it("returns 0 when either vector has zero magnitude", () => {
    // Consistent with module-vector-store — no division-by-zero,
    // the caller can't reasonably compare directions of a null vector.
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });
});

describe("normalize", () => {
  it("produces a unit vector (L2 norm = 1)", () => {
    const v = [3, 4];
    const n = normalize(v);

    const norm = Math.sqrt(n.reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it("preserves direction", () => {
    const v = [3, 4];
    const n = normalize(v);

    // Same direction: ratio of components should be equal
    expect(n[0] / n[1]).toBeCloseTo(v[0] / v[1], 10);
  });

  it("returns a new array (does not mutate input)", () => {
    const v = [3, 4];
    const n = normalize(v);

    expect(n).not.toBe(v);
    expect(v).toEqual([3, 4]);
  });

  it("normalizing a unit vector returns the same values", () => {
    const v = normalize([1, 0, 0]);
    const n = normalize(v);

    expect(n[0]).toBeCloseTo(v[0], 10);
    expect(n[1]).toBeCloseTo(v[1], 10);
    expect(n[2]).toBeCloseTo(v[2], 10);
  });

  it("throws on zero vector", () => {
    expect(() => normalize([0, 0, 0])).toThrow(/zero vector/);
  });
});
