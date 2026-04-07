// ── Auth0 Provider ───────────────────────────────────────────────────
//
// Verifies JWTs issued by Auth0. Uses jose for token verification
// against Auth0's JWKS endpoint, which is derived from the Auth0 domain.
//
// Environment variables:
//   AUTH0_DOMAIN   — Auth0 tenant domain (e.g. "my-app.us.auth0.com")
//   AUTH0_AUDIENCE — API identifier / audience for token validation

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

const auth0Provider: AuthProvider = {
  name: "auth0",

  async verifyRequest(request: AuthRequest): Promise<AuthResult> {
    const domain = process.env.AUTH0_DOMAIN;
    const audience = process.env.AUTH0_AUDIENCE;

    if (!domain) {
      return {
        authenticated: false,
        error: "Auth0 provider not configured: set AUTH0_DOMAIN",
      };
    }

    const token = extractBearerToken(request);
    if (!token) {
      return { authenticated: false, error: "Missing Bearer token" };
    }

    try {
      const issuer = `https://${domain}/`;
      const jwksUrl = new URL(`${issuer}.well-known/jwks.json`);
      const jwks = jose.createRemoteJWKSet(jwksUrl);

      const { payload } = await jose.jwtVerify(token, jwks, {
        issuer,
        audience,
      });

      // Auth0 tokens use standard claims plus custom namespaced claims
      // for roles. Common patterns: `${namespace}/roles` or
      // `permissions` for RBAC.
      const roles: string[] =
        (payload.permissions as string[]) ??
        (payload[`${issuer}roles`] as string[]) ??
        [];

      return {
        authenticated: true,
        user: {
          id: payload.sub ?? "unknown",
          email: (payload.email as string) ?? undefined,
          name: (payload.name as string) ?? undefined,
          roles,
          metadata: { auth0Claims: payload },
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Auth0 verification failed";
      return { authenticated: false, error: message };
    }
  },
};

// Self-register
registerProvider("auth0", () => auth0Provider);

export { auth0Provider };
