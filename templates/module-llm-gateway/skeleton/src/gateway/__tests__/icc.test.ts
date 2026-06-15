import { describe, it, expect } from "vitest";
import { reward, computeIcc, renderIccMarkdown, type RoutingLogEntry } from "../diagnostics/icc.js";

describe("reward", () => {
  it("mirrors adaptive's composite score (0.7 success + 0.3 inverse-latency)", () => {
    expect(reward({ provider: "a", success: true, latencyMs: 100 })).toBeCloseTo(1.0, 6);
    expect(reward({ provider: "a", success: false, latencyMs: 10000 })).toBeCloseTo(0.003, 3);
    // success but slow: full success weight + small latency weight
    expect(reward({ provider: "a", success: true, latencyMs: 500 })).toBeCloseTo(0.76, 2);
  });
});

describe("computeIcc", () => {
  it("recommends LinUCB when reward tracks the context bucket (high ICC)", () => {
    // taskType drives the bucket; chat is always fast+success, code always slow+fail.
    // Reward is fully determined by the bucket → between-bucket variance dominates.
    const log: RoutingLogEntry[] = [];
    for (let i = 0; i < 1200; i++) {
      const chat = i % 2 === 0;
      log.push({
        provider: "a",
        success: chat,
        latencyMs: chat ? 100 : 10000,
        features: { estimatedTokens: 50, latencyBudgetMs: 5000, taskType: chat ? "chat" : "code" },
      });
    }
    const r = computeIcc(log);
    expect(r.recommendation).toBe("switch-to-linucb");
    expect(r.icc).toBeGreaterThan(0.5);
    expect(r.totalSamples).toBe(1200);
  });

  it("recommends epsilon-greedy when reward is independent of the bucket (low ICC)", () => {
    // Bucket = taskType (i % 2); success alternates on floor(i/2) % 2, which is
    // independent of the bucket → each bucket sees ~50% success → low between-variance.
    const log: RoutingLogEntry[] = [];
    for (let i = 0; i < 1200; i++) {
      const chat = i % 2 === 0;
      log.push({
        provider: "a",
        success: Math.floor(i / 2) % 2 === 0,
        latencyMs: 500,
        features: { estimatedTokens: 50, latencyBudgetMs: 5000, taskType: chat ? "chat" : "code" },
      });
    }
    const r = computeIcc(log);
    expect(r.recommendation).toBe("stay-epsilon-greedy");
    expect(r.icc).toBeLessThan(0.05);
  });

  it("is inconclusive below the minimum sample count", () => {
    const log: RoutingLogEntry[] = Array.from({ length: 10 }, (_, i) => ({
      provider: "a",
      success: i % 2 === 0,
      latencyMs: 200,
      features: { taskType: i % 2 === 0 ? "chat" : "code" },
    }));
    const r = computeIcc(log);
    expect(r.recommendation).toBe("inconclusive");
    expect(r.totalSamples).toBe(10);
  });

  it("buckets by token quartile and reports per-provider breakdowns", () => {
    const log: RoutingLogEntry[] = [];
    for (let i = 0; i < 1200; i++) {
      log.push({
        provider: i % 2 === 0 ? "a" : "b",
        success: true,
        latencyMs: 300,
        features: {
          estimatedTokens: i % 4 < 2 ? 10 : 5000,
          taskType: "chat",
          latencyBudgetMs: 3000,
        },
      });
    }
    const r = computeIcc(log);
    expect(r.perProvider.map((p) => p.provider).sort()).toEqual(["a", "b"]);
    // two token bands → at least two distinct buckets in the breakdown
    expect(new Set(r.buckets.map((b) => b.bucket)).size).toBeGreaterThanOrEqual(2);
  });
});

describe("renderIccMarkdown", () => {
  it("renders a human-readable report", () => {
    const log: RoutingLogEntry[] = Array.from({ length: 1000 }, (_, i) => ({
      provider: "a",
      success: i % 2 === 0,
      latencyMs: 250,
      features: { estimatedTokens: 100, taskType: "reasoning", latencyBudgetMs: 4000 },
    }));
    const md = renderIccMarkdown(computeIcc(log));
    expect(md).toContain("# LinUCB readiness");
    expect(md).toContain("Recommendation:");
    expect(md).toContain("Bucket × provider mean reward");
  });
});
