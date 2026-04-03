// ── Request/Response Transform Middleware ────────────────────────────
//
// Applies header and body transformation rules defined per route.
// Request transforms run before the proxy call. Response transforms
// are applied by the proxy layer itself (see router/proxy.ts). This
// middleware only handles request-side transforms that need to modify
// the Hono context before routing.
//

import type { Context, Next } from "hono";
import type { TransformRule } from "../types.js";

/**
 * Create a Hono middleware that applies request-side header transforms.
 * Response transforms are handled by the proxy layer after the upstream
 * responds, so this middleware only modifies outgoing request headers
 * by setting them on the Hono context for the proxy to pick up.
 */
export function createTransformMiddleware(
  transform: TransformRule,
): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    // Store the transform rule on the context so the proxy can apply
    // both request and response transforms in a single pass.
    c.set("transformRule", transform);
    await next();
  };
}
