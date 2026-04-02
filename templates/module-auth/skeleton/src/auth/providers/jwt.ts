// ── JWT Provider ─────────────────────────────────────────────────────
//
// Verifies JSON Web Tokens using the `jose` library. Supports both
// JWKS (remote key set) and shared-secret validation.
//
// Environment variables:
//   AUTH_JWT_SECRET     — Shared secret for HMAC-signed tokens
//   AUTH_JWT_JWKS_URL   — JWKS endpoint URL for RSA/EC-signed tokens
//   AUTH_JWT_ISSUER     — Expected `iss` claim (optional)
//   AUTH_JWT_AUDIENCE   — Expected `aud` claim (optional)
//
// If both SECRET and JWKS_URL are set, JWKS takes precedence.

import * as jose from "jose";
import type { AuthResult } from "../types.js";
import type { AuthProvider, AuthRequest } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// Circuit breaker for JWKS remote key fetches
const jwksCb = createCircuitBreaker();

/**
 * Extract a Bearer token from the Authorization header.
 */
function extractBearerToken(request: AuthRequest): string | null {
  const header =
    typeof request.headers.get === "function"
      ? request.headers.get("authorization")
      : (request.headers["authorization"] as string | undefined);

  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

// ── JWKS Cache ─────────────────────────────────────────────────────
// Cache the remote JWKS key set per URL to avoid fetching on every
// request. Entries expire after JWKS_CACHE_TTL_MS (5 minutes).

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

let jwksCache: {
  url: string;
  keySet: ReturnType<typeof jose.createRemoteJWKSet>;
  cachedAt: number;
} | null = null;

function getCachedJWKS(url: string): ReturnType<typeof jose.createRemoteJWKSet> {
  const now = Date.now();
  if (jwksCache && jwksCache.url === url && now - jwksCache.cachedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keySet;
  }
  const keySet = jose.createRemoteJWKSet(new URL(url));
  jwksCache = { url, keySet, cachedAt: now };
  return keySet;
}

/** Clear the cached JWKS key set (useful for testing or rotation). */
export function clearJwksCache(): void {
  jwksCache = null;
}

// ── Secret Validation ─────────────────────────────────────────────
//
// Weak defaults that must never be used in production. In development
// a warning is logged; in production the provider refuses to verify.

const WEAK_SECRETS = new Set([
  "change-me",
  "change-me-in-production",
  "secret",
  "test",
]);

function validateSecret(secret: string): { ok: boolean; warning?: string } {
  if (!WEAK_SECRETS.has(secret)) {
    return { ok: true };
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return {
      ok: false,
      warning: `AUTH_JWT_SECRET is set to a weak default ("${secret}") — refusing to verify tokens in production`,
    };
  }

  console.warn(
    `[auth] WARNING: AUTH_JWT_SECRET is set to a weak default ("${secret}"). Do not use this in production.`
  );
  return { ok: true };
}

const jwtProvider: AuthProvider = {
  name: "jwt",

  async verifyRequest(request: AuthRequest): Promise<AuthResult> {
    const token = extractBearerToken(request);
    if (!token) {
      return { authenticated: false, error: "Missing Bearer token" };
    }

    const jwksUrl = process.env.AUTH_JWT_JWKS_URL;
    const secret = process.env.AUTH_JWT_SECRET;
    const issuer = process.env.AUTH_JWT_ISSUER;
    const audience = process.env.AUTH_JWT_AUDIENCE;

    if (!jwksUrl && !secret) {
      return {
        authenticated: false,
        error:
          "JWT provider not configured: set AUTH_JWT_SECRET or AUTH_JWT_JWKS_URL",
      };
    }

    // Reject weak secrets in production, warn in development
    if (secret && !jwksUrl) {
      const check = validateSecret(secret);
      if (!check.ok) {
        return { authenticated: false, error: check.warning! };
      }
    }

    try {
      let payload: jose.JWTPayload;

      if (jwksUrl) {
        // ── JWKS verification (cached key set) ─────────────────────
        // Wrap the JWKS-based verification in the circuit breaker so
        // that repeated JWKS endpoint failures trip the breaker.
        const jwks = getCachedJWKS(jwksUrl);
        const result = await jwksCb.execute(() =>
          jose.jwtVerify(token, jwks, {
            issuer,
            audience,
          })
        );
        payload = result.payload;
      } else {
        // ── Shared secret verification ─────────────────────────────
        const encodedSecret = new TextEncoder().encode(secret);
        const result = await jose.jwtVerify(token, encodedSecret, {
          issuer,
          audience,
        });
        payload = result.payload;
      }

      return {
        authenticated: true,
        user: {
          id: payload.sub ?? "unknown",
          email: (payload.email as string) ?? undefined,
          name: (payload.name as string) ?? undefined,
          roles: Array.isArray(payload.roles)
            ? (payload.roles as string[])
            : [],
          metadata: { claims: payload },
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Token verification failed";
      return { authenticated: false, error: message };
    }
  },
};

// Self-register
registerProvider(jwtProvider);

export { jwtProvider };
