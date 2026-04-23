import type {
  UsageRecord,
  BillingPeriod,
  UsageSummary,
  LineItem,
  PricingRule,
  PricingTier,
} from "../types.js";
import type { UsageAggregator, UsageAggregatorConfig } from "./types.js";

// ── Usage Aggregator ───────────────────────────────────────────────
//
// Groups raw usage records by metric, applies pricing rules (per-unit,
// tiered, or flat), and produces a UsageSummary with computed line
// items. Pricing rules are matched by metric name — metrics without
// a matching rule default to per-unit at $0 (quantity-only tracking).
//

/**
 * Create a usage aggregator that computes billing summaries.
 *
 *   const aggregator = createUsageAggregator({
 *     pricingRules: [
 *       { metric: "api_calls", model: "per_unit", unitPrice: 1 },
 *       { metric: "storage_gb", model: "tiered", tiers: [
 *         { upTo: 10, unitPrice: 0 },
 *         { upTo: 100, unitPrice: 50 },
 *         { upTo: Infinity, unitPrice: 25 },
 *       ]},
 *     ],
 *   });
 *
 *   const summary = aggregator.aggregate(records, "cus-1", period);
 */
export function createUsageAggregator(config: UsageAggregatorConfig = {}): UsageAggregator {
  const rules = config.pricingRules ?? [];
  const ruleMap = new Map<string, PricingRule>(rules.map((r) => [r.metric, r]));

  function findRule(metric: string): PricingRule | undefined {
    return ruleMap.get(metric);
  }

  function computePerUnit(quantity: number, unitPrice: number, metric: string): LineItem {
    return {
      description: `${metric} — ${quantity} units @ ${unitPrice}/unit`,
      metric,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
    };
  }

  function computeFlat(quantity: number, flatAmount: number, metric: string): LineItem {
    return {
      description: `${metric} — flat fee`,
      metric,
      quantity,
      unitPrice: 0,
      amount: flatAmount,
    };
  }

  function computeTiered(quantity: number, tiers: PricingTier[], metric: string): LineItem {
    let remaining = quantity;
    let totalAmount = 0;
    let prevBound = 0;
    let appliedTier = "";

    for (const tier of tiers) {
      if (remaining <= 0) break;

      const tierCapacity = tier.upTo === Infinity ? remaining : tier.upTo - prevBound;
      const consumed = Math.min(remaining, tierCapacity);

      totalAmount += consumed * tier.unitPrice;
      remaining -= consumed;
      prevBound = tier.upTo === Infinity ? prevBound + consumed : tier.upTo;
      appliedTier = tier.label ?? `up to ${tier.upTo}`;
    }

    return {
      description: `${metric} — ${quantity} units (tiered)`,
      metric,
      quantity,
      unitPrice: quantity > 0 ? Math.round(totalAmount / quantity) : 0,
      amount: totalAmount,
      tier: appliedTier,
    };
  }

  return {
    aggregate(
      records: UsageRecord[],
      customerId: string,
      period: BillingPeriod,
    ): UsageSummary {
      // Group quantities by metric
      const totalByMetric: Record<string, number> = {};

      for (const record of records) {
        totalByMetric[record.metric] = (totalByMetric[record.metric] ?? 0) + record.quantity;
      }

      // Compute line items using pricing rules
      const lineItems: LineItem[] = [];

      for (const [metric, quantity] of Object.entries(totalByMetric)) {
        const rule = findRule(metric);

        if (!rule) {
          // No pricing rule — track quantity only, zero cost
          lineItems.push(computePerUnit(quantity, 0, metric));
          continue;
        }

        switch (rule.model) {
          case "per_unit":
            lineItems.push(computePerUnit(quantity, rule.unitPrice ?? 0, metric));
            break;

          case "flat":
            lineItems.push(computeFlat(quantity, rule.flatAmount ?? 0, metric));
            break;

          case "tiered":
            if (rule.tiers && rule.tiers.length > 0) {
              lineItems.push(computeTiered(quantity, rule.tiers, metric));
            } else {
              lineItems.push(computePerUnit(quantity, 0, metric));
            }
            break;
        }
      }

      return {
        customerId,
        period,
        totalByMetric,
        lineItems,
      };
    },
  };
}
