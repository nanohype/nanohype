import type { GatewayProvider } from "../providers/types.js";
import type { RoutingStrategy, RoutingContext } from "./types.js";
import { registerStrategy } from "./registry.js";

// ── Static Routing Strategy ─────────────────────────────────────────
//
// Fixed priority list — always selects the first available provider
// in the order they were configured. Falls through to the next
// provider if the first is unavailable. This is the simplest
// strategy and a good default for single-provider setups.
//

export function createStaticStrategy(): RoutingStrategy {
  return {
    name: "static",

    select(providers: GatewayProvider[], _context: RoutingContext): GatewayProvider {
      if (providers.length === 0) {
        throw new Error("No providers available for routing");
      }
      return providers[0];
    },
  };
}

// Self-register
registerStrategy("static", createStaticStrategy);
