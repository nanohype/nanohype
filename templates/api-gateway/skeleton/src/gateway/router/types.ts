// ── Router Types ────────────────────────────────────────────────────
//
// Types specific to the routing layer. MatchResult captures which
// route rule was selected and the resolved upstream URL after canary
// splitting and health filtering.
//

import type { RouteRule } from "../types.js";

/** Result of matching an incoming request against route rules. */
export interface MatchResult {
  /** The matched route rule. */
  rule: RouteRule;

  /** The resolved upstream URL (after canary selection). */
  upstreamUrl: string;

  /** The path to forward to the upstream (after optional prefix stripping). */
  forwardPath: string;
}
