// ── Per-Route CORS Middleware ────────────────────────────────────────
//
// Applies CORS headers for a specific route. Unlike global CORS
// middleware, this allows different CORS policies per route rule.
// Handles both preflight (OPTIONS) and actual requests.
//

import type { Context, Next } from "hono";
import type { CorsRule } from "../types.js";

/**
 * Create a Hono middleware that applies CORS headers for a single route.
 * Returns a 204 for preflight requests and sets headers for all others.
 */
export function createCorsMiddleware(
  rule: CorsRule,
): (c: Context, next: Next) => Promise<Response | void> {
  const allowOrigins = rule.origins;
  const allowMethods = (rule.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).join(", ");
  const allowHeaders = (rule.allowHeaders ?? ["Content-Type", "Authorization", "X-API-Key"]).join(", ");
  const exposeHeaders = rule.exposeHeaders?.join(", ") ?? "";
  const maxAge = String(rule.maxAge ?? 86400);

  function isOriginAllowed(origin: string): boolean {
    if (allowOrigins.includes("*")) return true;
    return allowOrigins.includes(origin);
  }

  return async (c: Context, next: Next) => {
    const origin = c.req.header("origin") ?? "";
    const allowed = isOriginAllowed(origin);

    if (allowed) {
      c.header("Access-Control-Allow-Origin", allowOrigins.includes("*") ? "*" : origin);
      c.header("Access-Control-Allow-Methods", allowMethods);
      c.header("Access-Control-Allow-Headers", allowHeaders);
      if (exposeHeaders) {
        c.header("Access-Control-Expose-Headers", exposeHeaders);
      }
      c.header("Access-Control-Max-Age", maxAge);
    }

    // Handle preflight
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}
