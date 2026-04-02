// ── Rate Limit Middleware Factory ────────────────────────────────────
//
// Creates middleware functions for Hono and Express that apply rate
// limiting to incoming requests. The middleware extracts a key from
// the request (default: IP address) and uses the configured rate
// limiter to check and enforce limits. Standard rate limit headers
// are set on the response.
//

import type { RateLimitOptions, RateLimitResult } from "./types.js";
import type { RateLimiter } from "./index.js";

/** Options for middleware factories. */
export interface MiddlewareOptions extends RateLimitOptions {
  /** Function to extract the rate limit key from a request. Defaults to IP address. */
  keyExtractor?: (request: unknown) => string;

  /** Custom response body when rate limited. */
  message?: string;

  /** HTTP status code when rate limited (default: 429). */
  statusCode?: number;
}

/**
 * Set standard rate limit headers on a headers object.
 */
function setRateLimitHeaders(
  headers: { set: (name: string, value: string) => void },
  result: RateLimitResult,
): void {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}

/**
 * Default key extraction — pulls IP from common header/property locations.
 */
function defaultKeyExtractor(request: unknown): string {
  const req = request as Record<string, unknown>;

  // Hono: c.req.header("x-forwarded-for")
  if (req.header && typeof req.header === "function") {
    const forwarded = (req.header as (name: string) => string | undefined)("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
  }

  // Express: req.ip or req.headers["x-forwarded-for"]
  if (typeof req.ip === "string") return req.ip;

  const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
  if (headers) {
    const forwarded = headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  }

  return "unknown";
}

/**
 * Create a Hono middleware that applies rate limiting.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { createRateLimiter } from "__PROJECT_NAME__";
 * import { honoMiddleware } from "__PROJECT_NAME__/middleware";
 *
 * const limiter = await createRateLimiter();
 * const app = new Hono();
 * app.use("/api/*", honoMiddleware(limiter));
 * ```
 */
export function honoMiddleware(
  limiter: RateLimiter,
  opts?: MiddlewareOptions,
): (c: unknown, next: () => Promise<void>) => Promise<unknown> {
  const keyExtractor = opts?.keyExtractor ?? defaultKeyExtractor;
  const message = opts?.message ?? "Too Many Requests";
  const statusCode = opts?.statusCode ?? 429;

  return async (c: unknown, next: () => Promise<void>): Promise<unknown> => {
    const ctx = c as {
      req: { raw: Request; header: (name: string) => string | undefined };
      json: (body: unknown, status: number) => unknown;
      header: (name: string, value: string) => void;
    };

    const key = keyExtractor(ctx.req);
    const result = await limiter.check(key);

    // Set rate limit headers on all responses
    setRateLimitHeaders({ set: (name, value) => ctx.header(name, value) }, result);

    if (!result.allowed) {
      return ctx.json(
        { error: message, retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000) },
        statusCode,
      );
    }

    await next();
  };
}

/**
 * Create an Express middleware that applies rate limiting.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { createRateLimiter } from "__PROJECT_NAME__";
 * import { expressMiddleware } from "__PROJECT_NAME__/middleware";
 *
 * const limiter = await createRateLimiter();
 * const app = express();
 * app.use("/api", expressMiddleware(limiter));
 * ```
 */
export function expressMiddleware(
  limiter: RateLimiter,
  opts?: MiddlewareOptions,
): (req: unknown, res: unknown, next: (err?: unknown) => void) => void {
  const keyExtractor = opts?.keyExtractor ?? defaultKeyExtractor;
  const message = opts?.message ?? "Too Many Requests";
  const statusCode = opts?.statusCode ?? 429;

  return (req: unknown, res: unknown, next: (err?: unknown) => void): void => {
    const expressRes = res as {
      set: (name: string, value: string) => void;
      status: (code: number) => { json: (body: unknown) => void };
    };

    const key = keyExtractor(req);

    limiter
      .check(key)
      .then((result) => {
        setRateLimitHeaders(expressRes, result);

        if (!result.allowed) {
          expressRes
            .status(statusCode)
            .json({
              error: message,
              retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
            });
          return;
        }

        next();
      })
      .catch((err) => {
        next(err);
      });
  };
}
