import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  dotProduct,
  normalize,
  magnitude,
} from "../similarity.js";

describe("similarity functions", () => {
  describe("magnitude", () => {
    it("computes L2 norm of a vector", () => {
      expect(magnitude([3, 4])).toBeCloseTo(5);
    });

    it("returns 0 for zero vector", () => {
      expect(magnitude([0, 0, 0])).toBe(0);
    });

    it("returns 1 for unit vector", () => {
      expect(magnitude([1, 0, 0])).toBeCloseTo(1);
    });
  });

  describe("dotProduct", () => {
    it("computes dot product of two vectors", () => {
      expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32); // 4+10+18
    });

    it("returns 0 for orthogonal vectors", () => {
      expect(dotProduct([1, 0], [0, 1])).toBe(0);
    });

    it("throws on dimension mismatch", () => {
      expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow(/Dimension mismatch/);
    });
  });

  describe("normalize", () => {
    it("produces a unit vector", () => {
      const result = normalize([3, 4]);
      expect(magnitude(result)).toBeCloseTo(1);
      expect(result[0]).toBeCloseTo(0.6);
      expect(result[1]).toBeCloseTo(0.8);
    });

    it("returns zero vector for zero input", () => {
      const result = normalize([0, 0, 0]);
      expect(result).toEqual([0, 0, 0]);
    });

    it("preserves direction", () => {
      const result = normalize([2, 0, 0]);
      expect(result[0]).toBeCloseTo(1);
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(0);
    });
  });

  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    });

    it("returns 1 for scaled identical vectors", () => {
      expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    });

    it("returns 0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("returns -1 for opposite vectors", () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it("returns 0 when either vector has zero magnitude", () => {
      expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
      expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
    });

    it("throws on dimension mismatch", () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/Dimension mismatch/);
    });

    it("handles negative components correctly", () => {
      const a = [1, -1, 0];
      const b = [-1, 1, 0];
      // These are opposite directions, so similarity should be -1
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
    });

    it("handles high-dimensional vectors", () => {
      const dim = 1536;
      const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
      const b = Array.from({ length: dim }, (_, i) => Math.sin(i));
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });
  });
});
