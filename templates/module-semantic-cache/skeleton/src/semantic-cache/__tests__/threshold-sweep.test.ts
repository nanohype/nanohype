import { describe, it, expect } from "vitest";
import {
  sweepThresholds,
  sweepEmbeddings,
  renderSweepMarkdown,
  type SweepSample,
} from "../threshold-sweep.js";

// Same-intent pairs cluster high (≥0.95); different-intent pairs sit lower
// (0.86–0.93). The right threshold captures the paraphrases without serving the
// different-intent ones.
function validationSet(): SweepSample[] {
  const samples: SweepSample[] = [];
  for (let i = 0; i < 100; i++)
    samples.push({ similarity: 0.95 + (i % 5) * 0.008, sameIntent: true });
  for (let i = 0; i < 100; i++)
    samples.push({ similarity: 0.86 + (i % 8) * 0.01, sameIntent: false });
  return samples;
}

describe("sweepThresholds", () => {
  it("recommends the lowest threshold that keeps false hits under tolerance", () => {
    const report = sweepThresholds(validationSet());
    // 0.92 lets different-intent (0.92, 0.93) leak in; 0.95 cleanly separates.
    expect(report.recommended).toBe(0.95);
  });

  it("reports rising false hits as the threshold drops", () => {
    const report = sweepThresholds(validationSet());
    const at = (t: number) => report.results.find((r) => r.threshold === t)!;
    expect(at(0.95).falseHits).toBe(0);
    expect(at(0.95).hitRate).toBeCloseTo(0.5, 6); // all 100 same-intent served, of 200
    expect(at(0.85).falseHitRate).toBeGreaterThan(at(0.95).falseHitRate);
    expect(at(0.85).served).toBe(200); // everything served at the lowest threshold
  });

  it("falls back to the strictest threshold when nothing is clean enough", () => {
    // Every pair is a near-duplicate different-intent query — no threshold is safe.
    const noisy: SweepSample[] = Array.from({ length: 50 }, () => ({
      similarity: 0.99,
      sameIntent: false,
    }));
    const report = sweepThresholds(noisy);
    expect(report.recommended).toBe(0.98);
    expect(report.reason).toContain("No threshold");
  });

  it("handles an empty validation set without crashing", () => {
    const report = sweepThresholds([]);
    expect(report.recommended).toBe(0.98);
    expect(report.results.every((r) => r.hitRate === 0)).toBe(true);
  });
});

describe("sweepEmbeddings", () => {
  it("derives similarity from embedding pairs via cosine", () => {
    const report = sweepEmbeddings([
      { queryEmbedding: [1, 0], candidateEmbedding: [1, 0], sameIntent: true }, // cosine 1
      { queryEmbedding: [1, 0], candidateEmbedding: [0, 1], sameIntent: false }, // cosine 0
    ]);
    const at95 = report.results.find((r) => r.threshold === 0.95)!;
    expect(at95.served).toBe(1); // only the identical pair clears 0.95
    expect(at95.falseHits).toBe(0);
  });
});

describe("renderSweepMarkdown", () => {
  it("renders a human-readable table", () => {
    const md = renderSweepMarkdown(sweepThresholds(validationSet()));
    expect(md).toContain("# Semantic cache threshold sweep");
    expect(md).toContain("Recommended `similarityThreshold`: 0.95");
    expect(md).toContain("False-hit rate");
  });
});
