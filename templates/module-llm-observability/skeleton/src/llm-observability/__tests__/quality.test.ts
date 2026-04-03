import { describe, it, expect } from "vitest";
import { createQualityMonitor } from "../quality/monitor.js";

// ── Quality Monitor Tests ──────────────────────────────────────────

describe("quality monitor", () => {
  it("records scores and returns stats", () => {
    const monitor = createQualityMonitor();

    monitor.record("req-1", 0.9);
    monitor.record("req-2", 0.85);
    monitor.record("req-3", 0.95);

    const stats = monitor.getStats();
    expect(stats.count).toBe(3);
    expect(stats.avg).toBeCloseTo(0.9, 2);
  });

  it("returns zero stats for empty monitor", () => {
    const monitor = createQualityMonitor();

    const stats = monitor.getStats();
    expect(stats.count).toBe(0);
    expect(stats.avg).toBe(0);
    expect(stats.p50).toBe(0);
    expect(stats.p95).toBe(0);
    expect(stats.trend).toBe(0);
  });

  it("calculates p50 correctly", () => {
    const monitor = createQualityMonitor();

    // 10 scores: 0.1, 0.2, 0.3, ..., 1.0
    for (let i = 1; i <= 10; i++) {
      monitor.record(`req-${i}`, i / 10);
    }

    const stats = monitor.getStats();
    // Median of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] is 0.55
    expect(stats.p50).toBeCloseTo(0.55, 2);
  });

  it("calculates p95 correctly", () => {
    const monitor = createQualityMonitor();

    // 20 scores: 0.05, 0.10, 0.15, ..., 1.0
    for (let i = 1; i <= 20; i++) {
      monitor.record(`req-${i}`, i / 20);
    }

    const stats = monitor.getStats();
    // p95 should be close to the top values
    expect(stats.p95).toBeGreaterThan(0.9);
    expect(stats.p95).toBeLessThanOrEqual(1.0);
  });

  it("clamps scores to [0, 1] range", () => {
    const monitor = createQualityMonitor();

    monitor.record("req-1", 1.5);
    monitor.record("req-2", -0.3);

    const scores = monitor.getScores();
    expect(scores[0].score).toBe(1);
    expect(scores[1].score).toBe(0);
  });

  it("detects improving trend (positive)", () => {
    const monitor = createQualityMonitor();

    // First half: low scores
    for (let i = 0; i < 10; i++) {
      monitor.record(`req-low-${i}`, 0.5);
    }

    // Second half: high scores
    for (let i = 0; i < 10; i++) {
      monitor.record(`req-high-${i}`, 0.9);
    }

    const stats = monitor.getStats();
    expect(stats.trend).toBeGreaterThan(0);
  });

  it("detects regressing trend (negative)", () => {
    const monitor = createQualityMonitor();

    // First half: high scores
    for (let i = 0; i < 10; i++) {
      monitor.record(`req-high-${i}`, 0.9);
    }

    // Second half: low scores
    for (let i = 0; i < 10; i++) {
      monitor.record(`req-low-${i}`, 0.5);
    }

    const stats = monitor.getStats();
    expect(stats.trend).toBeLessThan(0);
  });

  it("regression threshold detection", () => {
    const monitor = createQualityMonitor();
    const threshold = -0.1;

    // Gradual quality decline
    for (let i = 0; i < 20; i++) {
      // Scores go from 0.9 down to 0.5
      const score = 0.9 - (i / 20) * 0.4;
      monitor.record(`req-${i}`, score);
    }

    const stats = monitor.getStats();
    // Trend should be negative — quality is regressing
    expect(stats.trend).toBeLessThan(threshold);
  });

  it("respects window size", () => {
    const monitor = createQualityMonitor();

    // Record 50 scores
    for (let i = 0; i < 50; i++) {
      monitor.record(`req-${i}`, 0.8);
    }

    const stats = monitor.getStats({ windowSize: 10 });
    expect(stats.count).toBe(10);
  });

  it("returns stable trend for consistent scores", () => {
    const monitor = createQualityMonitor();

    for (let i = 0; i < 20; i++) {
      monitor.record(`req-${i}`, 0.85);
    }

    const stats = monitor.getStats();
    expect(Math.abs(stats.trend)).toBeLessThan(0.01);
  });

  it("instances are independent — no shared state", () => {
    const monitorA = createQualityMonitor();
    const monitorB = createQualityMonitor();

    monitorA.record("req-1", 0.9);
    monitorA.record("req-2", 0.8);

    monitorB.record("req-3", 0.5);

    expect(monitorA.getStats().count).toBe(2);
    expect(monitorB.getStats().count).toBe(1);
    expect(monitorA.getStats().avg).toBeCloseTo(0.85, 2);
    expect(monitorB.getStats().avg).toBeCloseTo(0.5, 2);
  });
});
