import type { Context, Next } from "hono";
import { httpRequestTotal, httpRequestDuration } from "../metrics.js";

// ── Metrics Middleware ─────────────────────────────────────────────
//
// Records OTel counter and histogram for every HTTP request after the
// response completes. Labels: method, path, status. This is a no-op
// at runtime unless an OTel SDK is initialized — the API stubs
// silently discard data when no provider is registered.
//

export async function metricsMiddleware(
  c: Context,
  next: Next,
): Promise<void> {
  const start = performance.now();

  await next();

  const durationMs = performance.now() - start;
  const labels = {
    method: c.req.method,
    path: c.req.routePath || "unmatched",
    status: String(c.res.status),
  };

  httpRequestTotal.add(1, labels);
  httpRequestDuration.record(durationMs, labels);
}
