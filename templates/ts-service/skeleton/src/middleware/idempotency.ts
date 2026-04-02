import type { Context, Next } from "hono";
import { createHash } from "node:crypto";

// ── Idempotency Key Middleware ──────────────────────────────────────
//
// Ensures POST, PUT, and PATCH requests with an `Idempotency-Key`
// header are executed at most once. Subsequent requests with the same
// key replay the cached response (status + body). If the same key is
// reused with a different request body, a 409 Conflict is returned.
// Concurrent duplicate requests while the first is still in-flight
// receive a 409 with "Request in progress".
//
// GET, DELETE, OPTIONS, and HEAD requests ignore the header entirely.
//
// Usage:
//   import { idempotency } from "../middleware/idempotency.js";
//
//   app.use("/api/*", idempotency());
//   app.use("/api/*", idempotency({ ttlMs: 3600_000 })); // 1 hour TTL
//

interface CachedEntry {
  entryStatus: "pending" | "complete";
  bodyHash: string;
  expiresAt: number;
  /** Present only when entryStatus is "complete". */
  statusCode?: number;
  /** Present only when entryStatus is "complete". */
  body?: string;
  /** Present only when entryStatus is "complete". */
  contentType?: string;
}

interface IdempotencyOptions {
  /** Time-to-live for cached responses in milliseconds. Default: 86400000 (24h). */
  ttlMs?: number;
}

const IDEMPOTENT_METHODS = new Set(["POST", "PUT", "PATCH"]);

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function idempotency(options?: IdempotencyOptions) {
  const ttlMs = options?.ttlMs ?? 86_400_000; // 24 hours
  const store = new Map<string, CachedEntry>();

  // Periodic cleanup of expired entries
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  };

  // Run cleanup every 5 minutes
  const cleanupInterval = setInterval(cleanup, 300_000);
  cleanupInterval.unref?.();

  return async (c: Context, next: Next): Promise<void | Response> => {
    // Only apply to mutating methods
    if (!IDEMPOTENT_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const idempotencyKey = c.req.header("Idempotency-Key");

    // No key — proceed normally
    if (!idempotencyKey) {
      await next();
      return;
    }

    // Read request body for hash comparison.
    // Clone the underlying Request so the original body stream remains
    // unconsumed for downstream handlers.
    const rawBody = await c.req.raw.clone().text();
    const bodyHash = hashBody(rawBody);

    // Check for existing entry
    const cached = store.get(idempotencyKey);

    if (cached) {
      // Expired — remove and proceed as new
      if (cached.expiresAt <= Date.now()) {
        store.delete(idempotencyKey);
      } else {
        // Same key, different body — conflict
        if (cached.bodyHash !== bodyHash) {
          return c.json(
            {
              error: {
                code: "IDEMPOTENCY_CONFLICT",
                message:
                  "Idempotency-Key has already been used with a different request body",
                statusCode: 409,
              },
            },
            409
          );
        }

        // Request is still being processed by the first caller
        if (cached.entryStatus === "pending") {
          return c.json(
            {
              error: {
                code: "IDEMPOTENCY_IN_PROGRESS",
                message: "Request in progress",
                statusCode: 409,
              },
            },
            409
          );
        }

        // Same key, same body, complete — replay cached response
        return new Response(cached.body, {
          status: cached.statusCode!,
          headers: {
            "Content-Type": cached.contentType ?? "application/json",
            "Idempotency-Key": idempotencyKey,
            "X-Idempotent-Replayed": "true",
          },
        });
      }
    }

    // Store a "pending" sentinel immediately so concurrent duplicates see it
    store.set(idempotencyKey, {
      entryStatus: "pending",
      bodyHash,
      expiresAt: Date.now() + ttlMs,
    });

    // Execute the handler and capture the response
    try {
      await next();

      const res = c.res;
      const responseBody = await res.clone().text();
      const contentType =
        res.headers.get("Content-Type") ?? "application/json";

      // Replace the sentinel with the real cached response
      store.set(idempotencyKey, {
        entryStatus: "complete",
        statusCode: res.status,
        body: responseBody,
        contentType,
        bodyHash,
        expiresAt: Date.now() + ttlMs,
      });

      // Echo the idempotency key in the response
      c.header("Idempotency-Key", idempotencyKey);
    } catch (error) {
      // Handler failed — remove the pending sentinel so the request can be retried
      store.delete(idempotencyKey);
      throw error;
    }
  };
}
