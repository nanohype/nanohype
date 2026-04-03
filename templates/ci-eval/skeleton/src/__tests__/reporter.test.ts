import { describe, it, expect } from "vitest";
import { formatMarkdownReport } from "../ci-eval/reporter.js";
import type { ComparisonResult, SuiteScore } from "../ci-eval/types.js";

function makeComparison(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    suites: [],
    hasRegression: false,
    threshold: 0.05,
    timestamp: "2025-06-01T12:00:00.000Z",
    ...overrides,
  };
}

function makeScore(overrides: Partial<SuiteScore> = {}): SuiteScore {
  return {
    suite: "test-suite",
    passed: 9,
    total: 10,
    passRate: 0.9,
    averageScore: 0.92,
    durationMs: 3400,
    cases: [
      { name: "case-1", pass: true, score: 1.0, output: "ok", durationMs: 500 },
      { name: "case-2", pass: true, score: 0.85, output: "ok", durationMs: 700 },
      { name: "case-3", pass: false, score: 0, output: "", durationMs: 200, error: "Timeout" },
    ],
    ...overrides,
  };
}

describe("formatMarkdownReport", () => {
  it("includes the suite name in the summary table", () => {
    const comparison = makeComparison({
      suites: [
        {
          suite: "accuracy",
          currentPassRate: 0.9,
          currentScore: 0.92,
          baselinePassRate: 0.88,
          baselineScore: 0.9,
          scoreDelta: 0.02,
          regressed: false,
          isNew: false,
        },
      ],
    });
    const scores = [makeScore({ suite: "accuracy" })];
    const report = formatMarkdownReport(comparison, scores);

    expect(report).toContain("accuracy");
    expect(report).toContain("PASS");
    expect(report).toContain("92.0%");
  });

  it("marks regressions in the report header", () => {
    const comparison = makeComparison({
      hasRegression: true,
      suites: [
        {
          suite: "quality",
          currentPassRate: 0.5,
          currentScore: 0.4,
          baselinePassRate: 0.9,
          baselineScore: 0.9,
          scoreDelta: -0.5,
          regressed: true,
          isNew: false,
        },
      ],
    });
    const scores = [makeScore({ suite: "quality" })];
    const report = formatMarkdownReport(comparison, scores);

    expect(report).toContain("REGRESSION DETECTED");
    expect(report).toContain("FAIL");
    expect(report).toContain("-50.0%");
  });

  it("marks new suites without baseline", () => {
    const comparison = makeComparison({
      suites: [
        {
          suite: "new-feature",
          currentPassRate: 0.8,
          currentScore: 0.75,
          baselinePassRate: null,
          baselineScore: null,
          scoreDelta: 0,
          regressed: false,
          isNew: true,
        },
      ],
    });
    const scores = [makeScore({ suite: "new-feature" })];
    const report = formatMarkdownReport(comparison, scores);

    expect(report).toContain("NEW");
    expect(report).toContain("new-feature");
  });

  it("includes expandable details with case results", () => {
    const comparison = makeComparison({
      suites: [
        {
          suite: "details-check",
          currentPassRate: 0.9,
          currentScore: 0.92,
          baselinePassRate: 0.9,
          baselineScore: 0.9,
          scoreDelta: 0.02,
          regressed: false,
          isNew: false,
        },
      ],
    });
    const scores = [makeScore({ suite: "details-check" })];
    const report = formatMarkdownReport(comparison, scores);

    expect(report).toContain("<details>");
    expect(report).toContain("case-1");
    expect(report).toContain("case-2");
    expect(report).toContain("case-3");
  });

  it("shows errors in expandable details", () => {
    const comparison = makeComparison({
      suites: [
        {
          suite: "error-check",
          currentPassRate: 0.67,
          currentScore: 0.62,
          baselinePassRate: 0.9,
          baselineScore: 0.9,
          scoreDelta: -0.28,
          regressed: true,
          isNew: false,
        },
      ],
    });
    const scores = [makeScore({ suite: "error-check" })];
    const report = formatMarkdownReport(comparison, scores);

    expect(report).toContain("Errors:");
    expect(report).toContain("Timeout");
  });

  it("includes threshold information", () => {
    const comparison = makeComparison({ threshold: 0.1 });
    const report = formatMarkdownReport(comparison, []);

    expect(report).toContain("10.0%");
    expect(report).toContain("max regression allowed");
  });

  it("includes the timestamp", () => {
    const comparison = makeComparison({
      timestamp: "2025-06-01T12:00:00.000Z",
    });
    const report = formatMarkdownReport(comparison, []);

    expect(report).toContain("2025-06-01T12:00:00.000Z");
  });

  it("produces valid markdown table structure", () => {
    const comparison = makeComparison({
      suites: [
        {
          suite: "table-test",
          currentPassRate: 0.8,
          currentScore: 0.75,
          baselinePassRate: 0.7,
          baselineScore: 0.7,
          scoreDelta: 0.05,
          regressed: false,
          isNew: false,
        },
      ],
    });
    const report = formatMarkdownReport(comparison, []);
    const lines = report.split("\n");

    // Find the header row and separator
    const headerIdx = lines.findIndex((l) => l.startsWith("| Suite"));
    expect(headerIdx).toBeGreaterThan(-1);
    expect(lines[headerIdx + 1]).toMatch(/^\|[-|]+\|$/);
  });
});
