// ── Auth Middleware ──────────────────────────────────────────────────
//
// JWT and API key validation middleware for the gateway. Authentication
// mode is configured per route — "jwt" validates a Bearer token, "api-key"
// checks the X-API-Key header against a configured set, and "none" skips
// validation entirely. JWT verification uses jose for standards-compliant
// JWS validation with optional JWKS support.
//

import * as jose from "jose";
import type { Context, Next } from "hono";
import type { AuthMode, GatewayConfig } from "../types.js";
import type { Logger } from "../logger.js";

/** Lazily initialized JWKS remote key set. */
let jwksKeySet: jose.JWTVerifyGetKey | null = null;

/**
 * Get or create the JWKS key set for JWT verification.
 * Lazily initialized on first use — no module-level mutable state.
 */
function getJwksKeySet(jwksUrl: string): jose.JWTVerifyGetKey {
  if (!jwksKeySet) {
    jwksKeySet = jose.createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksKeySet;
}

/**
 * Verify a JWT token using either a symmetric secret or a JWKS endpoint.
 * Returns the payload on success, null on failure.
 */
async function verifyJwt(
  token: string,
  config: GatewayConfig,
): Promise<jose.JWTPayload | null> {
  try {
    if (config.jwksUrl) {
      const keySet = getJwksKeySet(config.jwksUrl);
      const { payload } = await jose.jwtVerify(token, keySet);
      return payload;
    }

    if (config.jwtSecret) {
      const secret = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jose.jwtVerify(token, secret);
      return payload;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validate an API key against the configured set. Returns true if the
 * key is valid.
 */
function validateApiKey(key: string, config: GatewayConfig): boolean {
  if (!config.apiKeys || config.apiKeys.length === 0) return false;
  return config.apiKeys.includes(key);
}

/**
 * Create a Hono middleware that enforces authentication for the given
 * auth mode. Returns a no-op middleware when mode is "none".
 */
export function createAuthMiddleware(
  mode: AuthMode,
  config: GatewayConfig,
  logger: Logger,
): (c: Context, next: Next) => Promise<Response | void> {
  if (mode === "none") {
    return async (_c: Context, next: Next) => {
      await next();
    };
  }

  if (mode === "jwt") {
    return async (c: Context, next: Next) => {
      const authHeader = c.req.header("authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        logger.warn("Missing or malformed Authorization header", {
          path: c.req.path,
        });
        return c.json({ error: "Unauthorized", message: "Bearer token required" }, 401);
      }

      const token = authHeader.slice(7);
      const payload = await verifyJwt(token, config);

      if (!payload) {
        logger.warn("JWT verification failed", { path: c.req.path });
        return c.json({ error: "Unauthorized", message: "Invalid or expired token" }, 401);
      }

      // Attach the JWT payload to the request context for downstream use
      c.set("jwtPayload", payload);
      await next();
    };
  }

  if (mode === "api-key") {
    return async (c: Context, next: Next) => {
      const apiKey = c.req.header("x-api-key");
      if (!apiKey) {
        logger.warn("Missing X-API-Key header", { path: c.req.path });
        return c.json({ error: "Unauthorized", message: "API key required" }, 401);
      }

      if (!validateApiKey(apiKey, config)) {
        logger.warn("Invalid API key", { path: c.req.path });
        return c.json({ error: "Unauthorized", message: "Invalid API key" }, 401);
      }

      await next();
    };
  }

  // Exhaustive check — should never reach here
  return async (_c: Context, next: Next) => {
    await next();
  };
}
