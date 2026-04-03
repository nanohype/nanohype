// ── Routing Strategy Interface ──────────────────────────────────────
//
// All routing strategies implement this interface. The registry
// pattern allows new strategies to be added by importing a strategy
// module that calls registerStrategy() at the module level.
//

import type { GatewayProvider } from "../providers/types.js";

/** Context available to routing strategies for provider selection. */
export interface RoutingContext {
  /** The user's message text (for content-based routing). */
  prompt: string;
  /** Requested model, if any. */
  model?: string;
  /** Tags for this request (user, project, etc.). */
  tags?: Record<string, string>;
}

export interface RoutingStrategy {
  /** Unique strategy name (e.g. "static", "round-robin", "adaptive"). */
  readonly name: string;

  /** Select a provider from the available list based on strategy logic. */
  select(providers: GatewayProvider[], context: RoutingContext): GatewayProvider;

  /** Record the outcome of a request for learning strategies. */
  recordOutcome?(provider: string, latencyMs: number, success: boolean): void;
}
