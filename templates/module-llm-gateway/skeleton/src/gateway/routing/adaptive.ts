import type { GatewayProvider } from "../providers/types.js";
import type { RoutingStrategy, RoutingContext } from "./types.js";
import { registerStrategy } from "./registry.js";

// ── Adaptive Routing Strategy ───────────────────────────────────────
//
// Epsilon-greedy exploration/exploitation. Tracks success rate and
// latency per provider in a sliding window. With probability epsilon
// (0.1), selects a random provider to explore. Otherwise, selects
// the best-known provider based on a composite score of success rate
// and inverse latency. Falls back to static (first provider) when
// fewer than MIN_SAMPLES data points exist across all providers.
//

const EPSILON = 0.1;
const WINDOW_SIZE = 100;
const MIN_SAMPLES = 10;

interface OutcomeEntry {
  success: boolean;
  latencyMs: number;
  timestamp: number;
}

interface ProviderStats {
  outcomes: OutcomeEntry[];
}

export function createAdaptiveStrategy(): RoutingStrategy {
  const stats = new Map<string, ProviderStats>();

  function getStats(providerName: string): ProviderStats {
    let s = stats.get(providerName);
    if (!s) {
      s = { outcomes: [] };
      stats.set(providerName, s);
    }
    return s;
  }

  function totalSamples(): number {
    let total = 0;
    for (const s of stats.values()) {
      total += s.outcomes.length;
    }
    return total;
  }

  function compositeScore(s: ProviderStats): number {
    if (s.outcomes.length === 0) return 0;
    const successes = s.outcomes.filter((o) => o.success).length;
    const successRate = successes / s.outcomes.length;
    const avgLatency =
      s.outcomes.reduce((sum, o) => sum + o.latencyMs, 0) / s.outcomes.length;
    // Normalize: success rate (0–1) weighted at 0.7, inverse latency weighted at 0.3
    // Latency normalization: 100ms = 1.0, 10000ms = 0.01
    const latencyScore = Math.min(1, 100 / (avgLatency || 1000));
    return 0.7 * successRate + 0.3 * latencyScore;
  }

  return {
    name: "adaptive",

    select(providers: GatewayProvider[], _context: RoutingContext): GatewayProvider {
      if (providers.length === 0) {
        throw new Error("No providers available for routing");
      }

      // Fall back to first provider when insufficient data
      if (totalSamples() < MIN_SAMPLES) {
        return providers[0];
      }

      // Epsilon-greedy: explore with probability epsilon
      if (Math.random() < EPSILON) {
        return providers[Math.floor(Math.random() * providers.length)];
      }

      // Exploit: pick provider with highest composite score
      let bestProvider = providers[0];
      let bestScore = -1;

      for (const provider of providers) {
        const s = getStats(provider.name);
        const score = compositeScore(s);
        if (score > bestScore) {
          bestScore = score;
          bestProvider = provider;
        }
      }

      return bestProvider;
    },

    recordOutcome(provider: string, latencyMs: number, success: boolean): void {
      const s = getStats(provider);

      s.outcomes.push({ success, latencyMs, timestamp: Date.now() });

      // Sliding window: evict oldest entry when over limit
      if (s.outcomes.length > WINDOW_SIZE) {
        s.outcomes.shift();
      }
    },
  };
}

// Self-register
registerStrategy("adaptive", createAdaptiveStrategy);
