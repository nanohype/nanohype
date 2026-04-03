import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadBaseline,
  saveBaseline,
  compareBaseline,
} from "../ci-eval/baseline.js";
import type { SuiteScore, BaselineEntry } from "../ci-eval/types.js";

function makeSuiteScore(overrides: Partial<SuiteScore> = {}): SuiteScore {
  return {
    suite: "test-suite",
    passed: 8,
    total: 10,
    passRate: 0.8,
    averageScore: 0.85,
    durationMs: 1200,
    cases: [],
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<BaselineEntry> = {}): BaselineEntry {
  return {
    suite: "test-suite",
    passRate: 0.8,
    averageScore: 0.85,
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("loadBaseline", () => {
  it("returns empty array when file does not exist", async () => {
    const result = await loadBaseline("/nonexistent/path.json");
    expect(result).toEqual([]);
  });

  it("returns empty array when file contains empty array", async () => {
    const path = join(tmpdir(), `baseline-test-${Date.now()}.json`);
    await writeFile(path, "[]", "utf-8");
    try {
      const result = await loadBaseline(path);
      expect(result).toEqual([]);
    } finally {
      await unlink(path).catch(() => {});
    }
  });

  it("loads baseline entries from a valid file", async () => {
    const path = join(tmpdir(), `baseline-test-${Date.now()}.json`);
    const entries = [makeBaseline()];
    await writeFile(path, JSON.stringify(entries), "utf-8");
    try {
      const result = await loadBaseline(path);
      expect(result).toHaveLength(1);
      expect(result[0].suite).toBe("test-suite");
      expect(result[0].averageScore).toBe(0.85);
    } finally {
      await unlink(path).catch(() => {});
    }
  });
});

describe("saveBaseline", () => {
  it("writes suite scores as baseline entries", async () => {
    const path = join(tmpdir(), `baseline-test-${Date.now()}.json`);
    const scores = [makeSuiteScore({ suite: "my-suite", averageScore: 0.9 })];
    try {
      await saveBaseline(path, scores);
      const result = await loadBaseline(path);
      expect(result).toHaveLength(1);
      expect(result[0].suite).toBe("my-suite");
      expect(result[0].averageScore).toBe(0.9);
      expect(result[0].updatedAt).toBeDefined();
    } finally {
      await unlink(path).catch(() => {});
    }
  });
});

describe("compareBaseline", () => {
  it("detects regression when score drops beyond threshold", () => {
    const current = [makeSuiteScore({ averageScore: 0.7 })];
    const stored = [makeBaseline({ averageScore: 0.85 })];
    const result = compareBaseline(current, stored, 0.05);

    expect(result.hasRegression).toBe(true);
    expect(result.suites[0].regressed).toBe(true);
    expect(result.suites[0].scoreDelta).toBeCloseTo(-0.15);
  });

  it("passes when score drop is within threshold", () => {
    const current = [makeSuiteScore({ averageScore: 0.82 })];
    const stored = [makeBaseline({ averageScore: 0.85 })];
    const result = compareBaseline(current, stored, 0.05);

    expect(result.hasRegression).toBe(false);
    expect(result.suites[0].regressed).toBe(false);
    expect(result.suites[0].scoreDelta).toBeCloseTo(-0.03);
  });

  it("passes when score improves", () => {
    const current = [makeSuiteScore({ averageScore: 0.95 })];
    const stored = [makeBaseline({ averageScore: 0.85 })];
    const result = compareBaseline(current, stored, 0.05);

    expect(result.hasRegression).toBe(false);
    expect(result.suites[0].scoreDelta).toBeCloseTo(0.1);
  });

  it("marks suites as new when no baseline exists", () => {
    const current = [makeSuiteScore({ suite: "new-suite" })];
    const stored: BaselineEntry[] = [];
    const result = compareBaseline(current, stored, 0.05);

    expect(result.hasRegression).toBe(false);
    expect(result.suites[0].isNew).toBe(true);
    expect(result.suites[0].baselineScore).toBeNull();
  });

  it("handles multiple suites with mixed results", () => {
    const current = [
      makeSuiteScore({ suite: "stable", averageScore: 0.9 }),
      makeSuiteScore({ suite: "regressed", averageScore: 0.5 }),
      makeSuiteScore({ suite: "brand-new", averageScore: 0.7 }),
    ];
    const stored = [
      makeBaseline({ suite: "stable", averageScore: 0.88 }),
      makeBaseline({ suite: "regressed", averageScore: 0.9 }),
    ];
    const result = compareBaseline(current, stored, 0.05);

    expect(result.hasRegression).toBe(true);

    const stable = result.suites.find((s) => s.suite === "stable");
    expect(stable?.regressed).toBe(false);

    const regressed = result.suites.find((s) => s.suite === "regressed");
    expect(regressed?.regressed).toBe(true);

    const brandNew = result.suites.find((s) => s.suite === "brand-new");
    expect(brandNew?.isNew).toBe(true);
    expect(brandNew?.regressed).toBe(false);
  });

  it("uses the provided threshold value", () => {
    const current = [makeSuiteScore({ averageScore: 0.75 })];
    const stored = [makeBaseline({ averageScore: 0.85 })];

    // With a tight threshold, this is a regression
    const tight = compareBaseline(current, stored, 0.05);
    expect(tight.hasRegression).toBe(true);
    expect(tight.threshold).toBe(0.05);

    // With a loose threshold, this passes
    const loose = compareBaseline(current, stored, 0.15);
    expect(loose.hasRegression).toBe(false);
    expect(loose.threshold).toBe(0.15);
  });
});
