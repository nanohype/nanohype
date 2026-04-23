// ── Hono Analytics Middleware ──────────────────────────────────────
//
// Factory that creates a Hono middleware for automatic request event
// tracking. Captures method, path, status code, duration, and
// user agent on every request.
//
// Usage:
//   import { createHonoAnalytics } from "./middleware/hono.js";
//   app.use(createHonoAnalytics(analyticsClient));
//

import type { AnalyticsProvider } from "../providers/types.js";

/** Minimal Hono context shape -- avoids a hard dependency on hono. */
interface HonoContext {
  req: {
    method: string;
    path: string;
    header: (name: string) => string | undefined;
  };
  res: {
    status: number;
  };
}

type HonoNext = () => Promise<void>;
type HonoMiddleware = (c: HonoContext, next: HonoNext) => Promise<void>;

/**
 * Create a Hono middleware that auto-tracks request events.
 *
 * @param provider  An initialized AnalyticsProvider instance.
 * @param opts      Optional overrides.
 */
export function createHonoAnalytics(
  provider: AnalyticsProvider,
  opts?: { eventName?: string },
): HonoMiddleware {
  const eventName = opts?.eventName ?? "request";

  return async (c: HonoContext, next: HonoNext): Promise<void> => {
    const start = performance.now();

    await next();

    const durationMs = Math.round(performance.now() - start);

    provider.track({
      event: eventName,
      properties: {
        method: c.req.method,
        path: c.req.path,
        statusCode: c.res.status,
        durationMs,
        userAgent: c.req.header("user-agent"),
      },
    }).catch(() => {
      // Non-blocking -- analytics should never break request flow
    });
  };
}
