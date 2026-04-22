import { describe, it, expect } from "vitest";
import { calculateCost, getModelPricing } from "../cost/pricing.js";
import { createCostTracker } from "../cost/tracker.js";
import { detectAnomalies } from "../cost/anomaly.js";
import type { GatewayResponse } from "../types.js";
import type { CostEntry } from "../cost/tracker.js";

// ── Cost Tracking Tests ─────────────────────────────────────────────

describe("pricing", () => {
  it("calculates cost for known model", () => {
    const cost = calculateCost("gpt-4o", 1000, 500);
    // gpt-4o: input $2.50/1M, output $10/1M
    // (1000 * 2.5 / 1_000_000) + (500 * 10 / 1_000_000) = 0.0025 + 0.005 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 6);
  });

  it("returns zero cost for unknown model", () => {
    const cost = calculateCost("unknown-model", 1000, 500);
    expect(cost).toBe(0);
  });

  it("looks up pricing for known models", () => {
    const pricing = getModelPricing("claude-sonnet-4-20250514");
    expect(pricing.input).toBe(3);
    expect(pricing.output).toBe(15);
  });
});

describe("cost tracker", () => {
  function makeResponse(
    provider: string,
    model: string,
    cost: number,
  ): GatewayResponse {
    return {
      text: "test",
      model,
      provider,
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 200,
      cached: false,
      cost,
    };
  }

  it("records and queries cost entries", () => {
    const tracker = createCostTracker();

    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.01), {
      user: "alice",
      project: "alpha",
    });
    tracker.record(makeResponse("openai", "gpt-4o", 0.005), {
      user: "bob",
      project: "alpha",
    });
    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.02), {
      user: "alice",
      project: "beta",
    });

    const summary = tracker.query();
    expect(summary.totalCost).toBeCloseTo(0.035, 6);
    expect(summary.totalRequests).toBe(3);
  });

  it("filters by provider", () => {
    const tracker = createCostTracker();

    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.01));
    tracker.record(makeResponse("openai", "gpt-4o", 0.005));

    const summary = tracker.query({ provider: "anthropic" });
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalCost).toBeCloseTo(0.01, 6);
  });

  it("breaks down cost by user", () => {
    const tracker = createCostTracker();

    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.01), {
      user: "alice",
    });
    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.02), {
      user: "alice",
    });
    tracker.record(makeResponse("openai", "gpt-4o", 0.005), { user: "bob" });

    const summary = tracker.query();
    expect(summary.byUser["alice"]).toBeCloseTo(0.03, 6);
    expect(summary.byUser["bob"]).toBeCloseTo(0.005, 6);
  });

  it("breaks down cost by project", () => {
    const tracker = createCostTracker();

    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.01), {
      project: "alpha",
    });
    tracker.record(makeResponse("openai", "gpt-4o", 0.02), { project: "beta" });

    const summary = tracker.query();
    expect(summary.byProject["alpha"]).toBeCloseTo(0.01, 6);
    expect(summary.byProject["beta"]).toBeCloseTo(0.02, 6);
  });

  it("breaks down cost by model", () => {
    const tracker = createCostTracker();

    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.01));
    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.02));
    tracker.record(makeResponse("openai", "gpt-4o", 0.005));

    const summary = tracker.query();
    expect(summary.byModel["claude-sonnet-4-20250514"]).toBeCloseTo(0.03, 6);
    expect(summary.byModel["gpt-4o"]).toBeCloseTo(0.005, 6);
  });

  it("filters by tags", () => {
    const tracker = createCostTracker();

    tracker.record(makeResponse("anthropic", "claude-sonnet-4-20250514", 0.01), {
      user: "alice",
      project: "alpha",
    });
    tracker.record(makeResponse("openai", "gpt-4o", 0.005), {
      user: "bob",
      project: "alpha",
    });

    const summary = tracker.query({ tags: { user: "alice" } });
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalCost).toBeCloseTo(0.01, 6);
  });
});

describe("anomaly detection", () => {
  it("detects cost spikes using z-score", () => {
    const entries: CostEntry[] = [];
    const baseTimestamp = new Date("2024-01-01T00:00:00Z");

    // 25 normal entries at ~$0.01
    for (let i = 0; i < 25; i++) {
      entries.push({
        timestamp: new Date(baseTimestamp.getTime() + i * 1000).toISOString(),
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01 + Math.random() * 0.001,
        latencyMs: 200,
        tags: {},
      });
    }

    // Spike entry at $0.50 (50x normal)
    entries.push({
      timestamp: new Date(baseTimestamp.getTime() + 25000).toISOString(),
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      inputTokens: 10000,
      outputTokens: 5000,
      cost: 0.5,
      latencyMs: 200,
      tags: {},
    });

    const anomalies = detectAnomalies(entries, 20, 2.0);

    // detectAnomalies returns entries in chronological order, not z-score
    // order, so the injected spike is not guaranteed to be anomalies[0] —
    // incidental tail draws from the uniform noise can trigger false
    // positives at earlier window positions. Assert that the spike IS in
    // the result set (which is what the test name promises).
    const spike = anomalies.find((a) => a.entry.cost === 0.5);
    expect(spike).toBeDefined();
    expect(spike!.zScore).toBeGreaterThan(2.0);
  });

  it("returns empty for uniform costs", () => {
    const entries: CostEntry[] = [];
    const baseTimestamp = new Date("2024-01-01T00:00:00Z");

    for (let i = 0; i < 30; i++) {
      entries.push({
        timestamp: new Date(baseTimestamp.getTime() + i * 1000).toISOString(),
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01,
        latencyMs: 200,
        tags: {},
      });
    }

    const anomalies = detectAnomalies(entries, 20, 2.0);
    expect(anomalies.length).toBe(0);
  });

  it("returns empty when insufficient data", () => {
    const entries: CostEntry[] = [
      {
        timestamp: new Date().toISOString(),
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01,
        latencyMs: 200,
        tags: {},
      },
    ];

    const anomalies = detectAnomalies(entries, 20, 2.0);
    expect(anomalies.length).toBe(0);
  });
});
