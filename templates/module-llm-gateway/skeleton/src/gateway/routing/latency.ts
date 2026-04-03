import type { GatewayProvider } from "../providers/types.js";
import type { RoutingStrategy, RoutingContext } from "./types.js";
import { registerStrategy } from "./registry.js";

// ── Latency-Based Routing Strategy ──────────────────────────────────
//
// Picks the provider with the lowest recent p50 latency. Maintains
// a sliding window of the last 100 latency samples per provider.
// Falls back to the first provider when no latency data exists.
//

const WINDOW_SIZE = 100;

export function createLatencyStrategy(): RoutingStrategy {
  const latencyWindows = new Map<string, number[]>();

  function getP50(providerName: string): number | undefined {
    const window = latencyWindows.get(providerName);
    if (!window || window.length === 0) return undefined;
    const sorted = [...window].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  return {
    name: "latency",

    select(providers: GatewayProvider[], _context: RoutingContext): GatewayProvider {
      if (providers.length === 0) {
        throw new Error("No providers available for routing");
      }

      let bestProvider = providers[0];
      let bestLatency = Infinity;

      for (const provider of providers) {
        const p50 = getP50(provider.name);
        if (p50 !== undefined && p50 < bestLatency) {
          bestLatency = p50;
          bestProvider = provider;
        }
      }

      return bestProvider;
    },

    recordOutcome(provider: string, latencyMs: number, _success: boolean): void {
      let window = latencyWindows.get(provider);
      if (!window) {
        window = [];
        latencyWindows.set(provider, window);
      }
      window.push(latencyMs);
      if (window.length > WINDOW_SIZE) {
        window.shift();
      }
    },
  };
}

// Self-register
registerStrategy("latency", createLatencyStrategy);
