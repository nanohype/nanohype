import type { Context, Next } from "hono";

// ── Request Logger ───────────────────────────────────────────────────
//
// Logs method, path, status, and duration for every request. Uses
// structured JSON in production and a compact human-readable format
// in development.
//

export async function loggerMiddleware(c: Context, next: Next): Promise<void> {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = (performance.now() - start).toFixed(2);
  const status = c.res.status;

  if (process.env.NODE_ENV === "production") {
    console.log(
      JSON.stringify({
        method,
        path,
        status,
        durationMs: Number(duration),
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    console.log(`${method} ${path} ${status} ${duration}ms`);
  }
}
