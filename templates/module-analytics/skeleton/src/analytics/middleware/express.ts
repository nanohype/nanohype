// ── Express Analytics Middleware ───────────────────────────────────
//
// Factory that creates an Express middleware for automatic request
// event tracking. Captures method, path, status code, duration,
// and user agent on every request.
//
// Usage:
//   import { createExpressAnalytics } from "./middleware/express.js";
//   app.use(createExpressAnalytics(analyticsClient));
//

import type { AnalyticsProvider } from "../providers/types.js";

/** Minimal Express types -- avoids a hard dependency on express. */
interface ExpressRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ExpressResponse {
  statusCode: number;
  on(event: string, listener: () => void): void;
}

type ExpressNext = () => void;
type ExpressMiddleware = (req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => void;

/**
 * Create an Express middleware that auto-tracks request events.
 *
 * @param provider  An initialized AnalyticsProvider instance.
 * @param opts      Optional overrides.
 */
export function createExpressAnalytics(
  provider: AnalyticsProvider,
  opts?: { eventName?: string },
): ExpressMiddleware {
  const eventName = opts?.eventName ?? "request";

  return (req: ExpressRequest, res: ExpressResponse, next: ExpressNext): void => {
    const start = performance.now();

    res.on("finish", () => {
      const durationMs = Math.round(performance.now() - start);

      provider.track({
        event: eventName,
        properties: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
          userAgent: Array.isArray(req.headers["user-agent"])
            ? req.headers["user-agent"][0]
            : req.headers["user-agent"],
        },
      }).catch(() => {
        // Non-blocking -- analytics should never break request flow
      });
    });

    next();
  };
}
