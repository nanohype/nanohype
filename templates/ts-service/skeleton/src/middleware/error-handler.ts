import type { Context } from "hono";

// ── Error Handler ────────────────────────────────────────────────────
//
// Global error handler mounted via app.onError(). Catches unhandled
// errors from route handlers and middleware, returning a consistent
// JSON error response. Logs the full error in non-production
// environments.
//

export function errorHandler(err: Error, c: Context): Response {
  const status = "status" in err && typeof err.status === "number" ? err.status : 500;

  if (process.env.NODE_ENV !== "production") {
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
  }

  return c.json(
    {
      error: status >= 500 ? "Internal Server Error" : err.message,
      ...(process.env.NODE_ENV !== "production" && { detail: err.message }),
    },
    status as any
  );
}
