import type { Context, Next } from "hono";

// ── Request ID Middleware ───────────────────────────────────────────
//
// Assigns a unique request ID to every incoming request. If the client
// sends an X-Request-Id header it is preserved; otherwise a new UUID
// is generated. The ID is set on the context for use by downstream
// handlers and echoed back in the response header.
//

export async function requestId(c: Context, next: Next): Promise<void> {
  const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
}
