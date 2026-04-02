import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as jose from "jose";
import { jwtProvider } from "../providers/jwt.js";

// ── Helpers ─────────────────────────────────────────────────────────

const SECRET = "test-secret-that-is-long-enough-for-hs256-minimum";
const encodedSecret = new TextEncoder().encode(SECRET);

function fakeRequest(token?: string) {
  const headers: Record<string, string> = {};
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
      ...headers,
    },
  };
}

// ── Error Path Tests ────────────────────────────────────────────────
//
// Focused on failure modes: expired tokens, wrong secrets, weak
// secrets in production, missing headers, and malformed tokens.

describe("jwt provider — error paths", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_JWT_SECRET", SECRET);
    vi.stubEnv("AUTH_JWT_JWKS_URL", "");
    vi.stubEnv("AUTH_JWT_ISSUER", "");
    vi.stubEnv("AUTH_JWT_AUDIENCE", "");
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns authenticated: false for an expired token", async () => {
    const token = await new jose.SignJWT({ sub: "user-expired" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(encodedSecret);

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns authenticated: false for a token signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode(
      "completely-different-secret-value-for-testing"
    );
    const token = await new jose.SignJWT({ sub: "user-wrong-key" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(wrongSecret);

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns error about weak secret when in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "change-me");

    const token = await new jose.SignJWT({ sub: "user-prod" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("change-me"));

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(false);
    expect(result.error).toMatch(/weak/i);
  });

  it("returns authenticated: false with clear error when Authorization header is missing", async () => {
    const result = await jwtProvider.verifyRequest(fakeRequest());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("returns authenticated: false for a malformed Bearer token", async () => {
    const result = await jwtProvider.verifyRequest(
      fakeRequest("not.a.valid.jwt.at.all")
    );

    expect(result.authenticated).toBe(false);
    expect(result.error).toBeDefined();
  });
});
