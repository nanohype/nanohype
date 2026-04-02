import type { Context, Next } from "hono";
import { maskHeaders } from "./mask.js";

// ── Request Logger ───────────────────────────────────────────────────
//
// Emits a structured JSON log line for every request with consistent
// fields: requestId, method, path, statusCode, durationMs. In
// development mode a compact single-line format is used instead.
//
// Sensitive values (Authorization headers, database URLs with embedded
// passwords, API keys) are masked before they reach the log.
//

/**
 * Collect request headers into a plain object, masking any sensitive
 * values before they reach the log entry.
 */
function safeHeaders(c: Context): Record<string, string> {
  const raw: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    raw[key] = value;
  });
  return maskHeaders(raw);
}

export async function loggerMiddleware(c: Context, next: Next): Promise<void> {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;
  const requestId = (c.get("requestId") as string) ?? undefined;

  await next();

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const statusCode = c.res.status;

  if (process.env.NODE_ENV === "production") {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
      requestId,
      method,
      path,
      statusCode,
      durationMs,
      headers: safeHeaders(c),
    };

    console.log(JSON.stringify(entry));
  } else {
    const id = requestId ? ` [${requestId}]` : "";
    console.log(`${method} ${path} ${statusCode} ${durationMs}ms${id}`);
  }
}
