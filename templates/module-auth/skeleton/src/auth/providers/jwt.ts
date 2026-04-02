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

    try {
      let payload: jose.JWTPayload;

      if (jwksUrl) {
        // ── JWKS verification ──────────────────────────────────────
        const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
        const result = await jose.jwtVerify(token, jwks, {
          issuer,
          audience,
        });
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
