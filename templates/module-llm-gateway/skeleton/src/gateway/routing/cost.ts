import type { GatewayProvider } from "../providers/types.js";
import type { RoutingStrategy, RoutingContext } from "./types.js";
import { registerStrategy } from "./registry.js";

// ── Cost-Based Routing Strategy ─────────────────────────────────────
//
// Picks the cheapest provider that meets a minimum quality threshold.
// Quality is measured as success rate over the last 100 calls.
// Providers with fewer than 10 data points are assumed to meet
// the quality threshold. Falls back to the cheapest provider if
// none meet the threshold.
//

const WINDOW_SIZE = 100;
const QUALITY_THRESHOLD = 0.8;
const MIN_SAMPLES = 10;

interface OutcomeRecord {
  successes: number;
  total: number;
  history: boolean[];
}

function getCombinedPricing(provider: GatewayProvider): number {
  return provider.pricing.input + provider.pricing.output;
}

export function createCostStrategy(): RoutingStrategy {
  const outcomes = new Map<string, OutcomeRecord>();

  function getSuccessRate(providerName: string): number | undefined {
    const record = outcomes.get(providerName);
    if (!record || record.total < MIN_SAMPLES) return undefined;
    return record.successes / record.total;
  }

  return {
    name: "cost",

    select(providers: GatewayProvider[], _context: RoutingContext): GatewayProvider {
      if (providers.length === 0) {
        throw new Error("No providers available for routing");
      }

      // Filter providers that meet quality threshold (or have insufficient data)
      const qualified = providers.filter((p) => {
        const rate = getSuccessRate(p.name);
        return rate === undefined || rate >= QUALITY_THRESHOLD;
      });

      // If none qualify, fall back to cheapest overall
      const candidates = qualified.length > 0 ? qualified : providers;

      // Sort by combined pricing (input + output per 1M tokens)
      return candidates.reduce((cheapest, current) =>
        getCombinedPricing(current) < getCombinedPricing(cheapest) ? current : cheapest,
      );
    },

    recordOutcome(provider: string, _latencyMs: number, success: boolean): void {
      let record = outcomes.get(provider);
      if (!record) {
        record = { successes: 0, total: 0, history: [] };
        outcomes.set(provider, record);
      }

      record.history.push(success);
      record.total++;
      if (success) record.successes++;

      // Sliding window: remove oldest entry when over limit
      if (record.history.length > WINDOW_SIZE) {
        const removed = record.history.shift()!;
        record.total--;
        if (removed) record.successes--;
      }
    },
  };
}

// Self-register
registerStrategy("cost", createCostStrategy);
