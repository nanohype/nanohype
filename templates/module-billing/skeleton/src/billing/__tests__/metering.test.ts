import { describe, it, expect, beforeEach } from "vitest";
import { createUsageTracker } from "../metering/tracker.js";
import { createUsageAggregator } from "../metering/aggregator.js";
import type { UsageTracker } from "../metering/types.js";
import type { BillingPeriod } from "../types.js";

describe("usage tracker", () => {
  let tracker: UsageTracker;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    tracker = createUsageTracker({
      idGenerator: () => `test-${++idCounter}`,
    });
  });

  it("records a usage event and returns a UsageRecord", () => {
    const record = tracker.record({
      customerId: "cus-1",
      metric: "api_calls",
      quantity: 42,
    });

    expect(record.id).toBe("test-1");
    expect(record.customerId).toBe("cus-1");
    expect(record.metric).toBe("api_calls");
    expect(record.quantity).toBe(42);
    expect(record.timestamp).toBeDefined();
    expect(record.tags).toEqual({});
  });

  it("records usage with tags", () => {
    const record = tracker.record({
      customerId: "cus-1",
      metric: "tokens_used",
      quantity: 1000,
      tags: { model: "claude-3", endpoint: "/v1/chat" },
    });

    expect(record.tags).toEqual({ model: "claude-3", endpoint: "/v1/chat" });
  });

  it("throws on non-positive quantity", () => {
    expect(() =>
      tracker.record({ customerId: "cus-1", metric: "api_calls", quantity: 0 }),
    ).toThrow("positive number");

    expect(() =>
      tracker.record({ customerId: "cus-1", metric: "api_calls", quantity: -5 }),
    ).toThrow("positive number");
  });

  it("retrieves records by customer and period", () => {
    const now = new Date();
    const period: BillingPeriod = {
      start: new Date(now.getTime() - 1000).toISOString(),
      end: new Date(now.getTime() + 1000).toISOString(),
    };

    tracker.record({ customerId: "cus-1", metric: "api_calls", quantity: 10 });
    tracker.record({ customerId: "cus-1", metric: "tokens_used", quantity: 500 });
    tracker.record({ customerId: "cus-2", metric: "api_calls", quantity: 5 });

    const records = tracker.getRecords("cus-1", period);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.customerId === "cus-1")).toBe(true);
  });

  it("filters records by tags", () => {
    tracker.record({
      customerId: "cus-1",
      metric: "api_calls",
      quantity: 10,
      tags: { endpoint: "/v1/chat" },
    });
    tracker.record({
      customerId: "cus-1",
      metric: "api_calls",
      quantity: 5,
      tags: { endpoint: "/v1/embed" },
    });
    tracker.record({
      customerId: "cus-1",
      metric: "api_calls",
      quantity: 3,
      tags: { endpoint: "/v1/chat" },
    });

    const chatRecords = tracker.getRecordsByTags("cus-1", {
      endpoint: "/v1/chat",
    });
    expect(chatRecords).toHaveLength(2);
    expect(chatRecords.every((r) => r.tags.endpoint === "/v1/chat")).toBe(true);
  });

  it("clears all records", () => {
    tracker.record({ customerId: "cus-1", metric: "api_calls", quantity: 10 });
    tracker.record({ customerId: "cus-2", metric: "api_calls", quantity: 5 });

    tracker.clear();

    const now = new Date();
    const period: BillingPeriod = {
      start: new Date(now.getTime() - 10_000).toISOString(),
      end: new Date(now.getTime() + 10_000).toISOString(),
    };

    expect(tracker.getRecords("cus-1", period)).toHaveLength(0);
    expect(tracker.getRecords("cus-2", period)).toHaveLength(0);
  });
});

describe("usage aggregator", () => {
  it("aggregates usage by metric with per-unit pricing", () => {
    const aggregator = createUsageAggregator({
      pricingRules: [
        { metric: "api_calls", model: "per_unit", unitPrice: 1 },
        { metric: "tokens_used", model: "per_unit", unitPrice: 5 },
      ],
    });

    const now = new Date();
    const period: BillingPeriod = {
      start: new Date(now.getTime() - 1000).toISOString(),
      end: new Date(now.getTime() + 1000).toISOString(),
    };

    const records = [
      { id: "1", customerId: "cus-1", metric: "api_calls", quantity: 100, timestamp: now.toISOString(), tags: {} },
      { id: "2", customerId: "cus-1", metric: "api_calls", quantity: 50, timestamp: now.toISOString(), tags: {} },
      { id: "3", customerId: "cus-1", metric: "tokens_used", quantity: 1000, timestamp: now.toISOString(), tags: {} },
    ];

    const summary = aggregator.aggregate(records, "cus-1", period);

    expect(summary.customerId).toBe("cus-1");
    expect(summary.totalByMetric).toEqual({ api_calls: 150, tokens_used: 1000 });
    expect(summary.lineItems).toHaveLength(2);

    const apiItem = summary.lineItems.find((i) => i.metric === "api_calls")!;
    expect(apiItem.quantity).toBe(150);
    expect(apiItem.unitPrice).toBe(1);
    expect(apiItem.amount).toBe(150);

    const tokenItem = summary.lineItems.find((i) => i.metric === "tokens_used")!;
    expect(tokenItem.quantity).toBe(1000);
    expect(tokenItem.unitPrice).toBe(5);
    expect(tokenItem.amount).toBe(5000);
  });

  it("applies tiered pricing", () => {
    const aggregator = createUsageAggregator({
      pricingRules: [
        {
          metric: "storage_gb",
          model: "tiered",
          tiers: [
            { upTo: 10, unitPrice: 0, label: "free" },
            { upTo: 100, unitPrice: 50, label: "standard" },
            { upTo: Infinity, unitPrice: 25, label: "bulk" },
          ],
        },
      ],
    });

    const now = new Date();
    const period: BillingPeriod = {
      start: now.toISOString(),
      end: now.toISOString(),
    };

    const records = [
      { id: "1", customerId: "cus-1", metric: "storage_gb", quantity: 150, timestamp: now.toISOString(), tags: {} },
    ];

    const summary = aggregator.aggregate(records, "cus-1", period);

    expect(summary.lineItems).toHaveLength(1);
    const item = summary.lineItems[0]!;
    // First 10 free, next 90 at 50, next 50 at 25
    // 0 + 4500 + 1250 = 5750
    expect(item.amount).toBe(5750);
    expect(item.quantity).toBe(150);
  });

  it("applies flat pricing", () => {
    const aggregator = createUsageAggregator({
      pricingRules: [
        { metric: "seats", model: "flat", flatAmount: 9900 },
      ],
    });

    const now = new Date();
    const period: BillingPeriod = {
      start: now.toISOString(),
      end: now.toISOString(),
    };

    const records = [
      { id: "1", customerId: "cus-1", metric: "seats", quantity: 5, timestamp: now.toISOString(), tags: {} },
    ];

    const summary = aggregator.aggregate(records, "cus-1", period);

    expect(summary.lineItems).toHaveLength(1);
    expect(summary.lineItems[0]!.amount).toBe(9900);
  });

  it("defaults to zero-cost for metrics without pricing rules", () => {
    const aggregator = createUsageAggregator({ pricingRules: [] });

    const now = new Date();
    const period: BillingPeriod = {
      start: now.toISOString(),
      end: now.toISOString(),
    };

    const records = [
      { id: "1", customerId: "cus-1", metric: "unknown_metric", quantity: 100, timestamp: now.toISOString(), tags: {} },
    ];

    const summary = aggregator.aggregate(records, "cus-1", period);

    expect(summary.lineItems).toHaveLength(1);
    expect(summary.lineItems[0]!.amount).toBe(0);
    expect(summary.lineItems[0]!.quantity).toBe(100);
  });
});
