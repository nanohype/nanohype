import { describe, it, expect } from "vitest";
import { calculateCost, getModelPricing } from "../cost/pricing.js";
import { createCostCalculator } from "../cost/calculator.js";
import { detectAnomalies } from "../cost/anomaly.js";
import type { LlmSpan, CostEntry } from "../types.js";

// ── Cost Tracking Tests ────────────────────────────────────────────

function makeSpan(overrides: Partial<LlmSpan> = {}): LlmSpan {
  return {
    id: "span-1",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 200,
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    inputTokens: 1000,
    outputTokens: 500,
    cost: 0,
    success: true,
    tags: {},
    ...overrides,
  };
}

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

  it("calculates anthropic opus pricing", () => {
    const cost = calculateCost("claude-opus-4-20250514", 1000, 500);
    // (1000 * 15 / 1M) + (500 * 75 / 1M) = 0.015 + 0.0375 = 0.0525
    expect(cost).toBeCloseTo(0.0525, 6);
  });
});

describe("cost calculator", () => {
  it("records cost entries from spans", () => {
    const calculator = createCostCalculator();

    const entry = calculator.record(makeSpan());
    expect(entry.cost).toBeGreaterThan(0);
    expect(entry.model).toBe("claude-sonnet-4-20250514");
    expect(entry.provider).toBe("anthropic");
  });

  it("queries with no filters returns all entries", () => {
    const calculator = createCostCalculator();

    calculator.record(makeSpan({ model: "claude-sonnet-4-20250514", inputTokens: 100, outputTokens: 50 }));
    calculator.record(makeSpan({ model: "gpt-4o", provider: "openai", inputTokens: 200, outputTokens: 100 }));

    const summary = calculator.query();
    expect(summary.totalRequests).toBe(2);
    expect(summary.totalCost).toBeGreaterThan(0);
  });

  it("filters by provider", () => {
    const calculator = createCostCalculator();

    calculator.record(makeSpan({ provider: "anthropic" }));
    calculator.record(makeSpan({ provider: "openai", model: "gpt-4o" }));

    const summary = calculator.query({ provider: "anthropic" });
    expect(summary.totalRequests).toBe(1);
  });

  it("filters by model", () => {
    const calculator = createCostCalculator();

    calculator.record(makeSpan({ model: "claude-sonnet-4-20250514" }));
    calculator.record(makeSpan({ model: "gpt-4o", provider: "openai" }));

    const summary = calculator.query({ model: "gpt-4o" });
    expect(summary.totalRequests).toBe(1);
  });

  it("breaks down cost by model", () => {
    const calculator = createCostCalculator();

    calculator.record(makeSpan({ model: "claude-sonnet-4-20250514", inputTokens: 1000, outputTokens: 500 }));
    calculator.record(makeSpan({ model: "gpt-4o", provider: "openai", inputTokens: 1000, outputTokens: 500 }));

    const summary = calculator.query();
    expect(summary.byModel["claude-sonnet-4-20250514"]).toBeGreaterThan(0);
    expect(summary.byModel["gpt-4o"]).toBeGreaterThan(0);
  });

  it("breaks down cost by provider", () => {
    const calculator = createCostCalculator();

    calculator.record(makeSpan({ provider: "anthropic" }));
    calculator.record(makeSpan({ provider: "openai", model: "gpt-4o" }));

    const summary = calculator.query();
    expect(summary.byProvider["anthropic"]).toBeGreaterThan(0);
    expect(summary.byProvider["openai"]).toBeGreaterThan(0);
  });

  it("filters by tags", () => {
    const calculator = createCostCalculator();

    calculator.record(makeSpan({ tags: { user: "alice" } }));
    calculator.record(makeSpan({ tags: { user: "bob" } }));

    const summary = calculator.query({ tags: { user: "alice" } });
    expect(summary.totalRequests).toBe(1);
  });

  it("instances are independent — no shared state", () => {
    const calcA = createCostCalculator();
    const calcB = createCostCalculator();

    calcA.record(makeSpan());
    calcA.record(makeSpan());
    calcB.record(makeSpan());

    expect(calcA.query().totalRequests).toBe(2);
    expect(calcB.query().totalRequests).toBe(1);
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
        durationMs: 200,
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
      durationMs: 200,
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
        durationMs: 200,
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
        durationMs: 200,
        tags: {},
      },
    ];

    const anomalies = detectAnomalies(entries, 20, 2.0);
    expect(anomalies.length).toBe(0);
  });
});
