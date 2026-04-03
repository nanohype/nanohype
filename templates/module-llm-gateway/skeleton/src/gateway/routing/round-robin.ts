import type { GatewayProvider } from "../providers/types.js";
import type { RoutingStrategy, RoutingContext } from "./types.js";
import { registerStrategy } from "./registry.js";

// ── Round-Robin Routing Strategy ────────────────────────────────────
//
// Rotates through providers in order. Each call advances the index
// by one, wrapping around when it reaches the end. Distributes
// load evenly across all configured providers.
//

export function createRoundRobinStrategy(): RoutingStrategy {
  let currentIndex = 0;

  return {
    name: "round-robin",

    select(providers: GatewayProvider[], _context: RoutingContext): GatewayProvider {
      if (providers.length === 0) {
        throw new Error("No providers available for routing");
      }
      const provider = providers[currentIndex % providers.length];
      currentIndex = (currentIndex + 1) % providers.length;
      return provider;
    },
  };
}

// Self-register
registerStrategy("round-robin", createRoundRobinStrategy);
