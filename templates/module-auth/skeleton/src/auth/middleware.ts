// ── Auth Middleware Factory ───────────────────────────────────────────
//
// Creates middleware functions that are compatible with both Hono and
// Express. The middleware verifies the request using the specified auth
// provider and attaches the authenticated user to the request context.

import type { AuthConfig, AuthResult, AuthUser } from "./types.js";
import { getProvider, listProviders } from "./providers/registry.js";
import type { AuthRequest } from "./providers/types.js";

// Ensure all built-in providers are registered
import "./providers/index.js";

/**
 * Symbol used to attach the authenticated user to the request object.
 * Avoids key collisions with other middleware.
 */
export const AUTH_USER_KEY = Symbol.for("auth:user");

/**
 * Symbol used to attach the full auth result to the request object.
 */
export const AUTH_RESULT_KEY = Symbol.for("auth:result");

/**
 * Augmented request type with auth context attached by middleware.
 */
export interface AuthenticatedRequest {
  [AUTH_USER_KEY]?: AuthUser;
  [AUTH_RESULT_KEY]?: AuthResult;
}

/**
 * Retrieve the authenticated user from a request that has passed
 * through auth middleware. Returns undefined if the request was not
 * authenticated or middleware has not run.
 */
export function getAuthUser(request: unknown): AuthUser | undefined {
  return (request as AuthenticatedRequest)[AUTH_USER_KEY];
}

/**
 * Retrieve the full auth result from a request. Useful for inspecting
 * authentication errors in custom error handlers.
 */
export function getAuthResult(request: unknown): AuthResult | undefined {
  return (request as AuthenticatedRequest)[AUTH_RESULT_KEY];
}

/**
 * Generic middleware handler type that works with both Hono and Express.
 *
 * - Hono: `(c, next) => Promise<void | Response>`
 * - Express: `(req, res, next) => void`
 *
 * The middleware detects the calling convention by argument count and
 * the shape of the first argument.
 */
export type MiddlewareHandler = (
  ...args: unknown[]
) => unknown | Promise<unknown>;

/**
 * Create an auth middleware function for the given provider.
 *
 * The returned middleware is framework-agnostic — it detects whether
 * it's being called by Hono or Express and adapts accordingly.
 *
 * @param config - Auth configuration specifying which provider to use
 * @returns A middleware function compatible with Hono and Express
 *
 * @example
 * ```ts
 * // Hono
 * import { Hono } from "hono";
 * const app = new Hono();
 * app.use("/api/*", createAuthMiddleware({ provider: "jwt" }));
 *
 * // Express
 * import express from "express";
 * const app = express();
 * app.use("/api", createAuthMiddleware({ provider: "jwt" }));
 * ```
 */
export function createAuthMiddleware(config: AuthConfig): MiddlewareHandler {
  const { provider: providerName } = config;

  return async (...args: unknown[]): Promise<unknown> => {
    const provider = getProvider(providerName);
    if (!provider) {
      const available = listProviders().join(", ");
      const msg = `Auth provider "${providerName}" not found. Available: ${available}`;
      throw new Error(msg);
    }

    // ── Detect framework ───────────────────────────────────────────
    // Hono: middleware receives (context, next) where context has a
    //       `.req` property with `.header()`.
    // Express: middleware receives (req, res, next) where req has a
    //          `.headers` object.

    const firstArg = args[0] as Record<string, unknown>;

    // Hono context detection: has `.req` and `.json` method
    if (firstArg && typeof firstArg.req === "object" && typeof firstArg.json === "function") {
      return handleHono(provider, config, args);
    }

    // Express detection: first arg has `.headers` and third arg is a function
    if (firstArg && typeof firstArg.headers === "object" && typeof args[2] === "function") {
      return handleExpress(provider, config, args);
    }

    throw new Error(
      "Auth middleware could not detect framework. " +
      "Ensure it is used as Hono or Express middleware."
    );
  };
}

/**
 * Handle Hono middleware invocation.
 */
async function handleHono(
  provider: { verifyRequest: (req: AuthRequest) => Promise<AuthResult> },
  _config: AuthConfig,
  args: unknown[],
): Promise<unknown> {
  const c = args[0] as {
    req: { raw: Request; header: (name: string) => string | undefined };
    json: (body: unknown, status: number) => unknown;
    set: (key: string, value: unknown) => void;
  };
  const next = args[1] as () => Promise<void>;

  // Build an AuthRequest from Hono's request
  const authRequest: AuthRequest = {
    headers: {
      get: (name: string) => c.req.header(name) ?? null,
    },
  };

  const result = await provider.verifyRequest(authRequest);

  // Attach result to the raw request object for downstream access
  const raw = c.req.raw as unknown as AuthenticatedRequest;
  raw[AUTH_RESULT_KEY] = result;

  if (result.authenticated && result.user) {
    raw[AUTH_USER_KEY] = result.user;
    // Also set on Hono context for convenience
    c.set("authUser", result.user);
    c.set("authResult", result);
  }

  // Don't block — let downstream handlers/guards decide what to do
  await next();
}

/**
 * Handle Express middleware invocation.
 */
async function handleExpress(
  provider: { verifyRequest: (req: AuthRequest) => Promise<AuthResult> },
  _config: AuthConfig,
  args: unknown[],
): Promise<void> {
  const req = args[0] as Record<string, unknown> & {
    headers: Record<string, string | string[] | undefined>;
  };
  const _res = args[1];
  const next = args[2] as (err?: unknown) => void;

  // Build an AuthRequest from Express's request
  const authRequest: AuthRequest = {
    headers: {
      get: (name: string) =>
        (req.headers[name.toLowerCase()] as string) ?? null,
    },
  };

  try {
    const result = await provider.verifyRequest(authRequest);

    // Attach to the request object
    (req as unknown as AuthenticatedRequest)[AUTH_RESULT_KEY] = result;
    if (result.authenticated && result.user) {
      (req as unknown as AuthenticatedRequest)[AUTH_USER_KEY] = result.user;
      // Also set as plain properties for convenience
      req.authUser = result.user;
      req.authResult = result;
    }

    next();
  } catch (err) {
    next(err);
  }
}
