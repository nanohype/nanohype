import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as jose from "jose";

// Import the JWT provider — this triggers self-registration
import { jwtProvider } from "../providers/jwt.js";

describe("jwt provider", () => {
  const SECRET = "test-secret-that-is-long-enough-for-hs256-minimum";
  const encodedSecret = new TextEncoder().encode(SECRET);

  beforeEach(() => {
    vi.stubEnv("AUTH_JWT_SECRET", SECRET);
    vi.stubEnv("AUTH_JWT_JWKS_URL", "");
    vi.stubEnv("AUTH_JWT_ISSUER", "");
    vi.stubEnv("AUTH_JWT_AUDIENCE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Helper to build a fake request with an Authorization header.
   */
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

  it("has name 'jwt'", () => {
    expect(jwtProvider.name).toBe("jwt");
  });

  it("returns authenticated: false when no Bearer token is present", async () => {
    const result = await jwtProvider.verifyRequest(fakeRequest());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("returns authenticated: false when secret is not configured", async () => {
    vi.stubEnv("AUTH_JWT_SECRET", "");

    const result = await jwtProvider.verifyRequest(fakeRequest("some.jwt.token"));

    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("verifies a valid HS256 JWT and extracts claims", async () => {
    const token = await new jose.SignJWT({
      sub: "user-123",
      email: "alice@example.com",
      name: "Alice",
      roles: ["admin"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(encodedSecret);

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user!.id).toBe("user-123");
    expect(result.user!.email).toBe("alice@example.com");
    expect(result.user!.name).toBe("Alice");
    expect(result.user!.roles).toEqual(["admin"]);
  });

  it("returns authenticated: false for an expired JWT", async () => {
    const token = await new jose.SignJWT({ sub: "user-456" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(encodedSecret);

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns authenticated: false for a JWT signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-value-for-testing");
    const token = await new jose.SignJWT({ sub: "user-789" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(wrongSecret);

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("validates issuer claim when AUTH_JWT_ISSUER is set", async () => {
    vi.stubEnv("AUTH_JWT_ISSUER", "https://auth.example.com");

    const token = await new jose.SignJWT({ sub: "user-100" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://wrong-issuer.com")
      .setExpirationTime("1h")
      .sign(encodedSecret);

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(false);
  });

  it("defaults to empty roles when roles claim is absent", async () => {
    const token = await new jose.SignJWT({ sub: "user-no-roles" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(encodedSecret);

    const result = await jwtProvider.verifyRequest(fakeRequest(token));

    expect(result.authenticated).toBe(true);
    expect(result.user!.roles).toEqual([]);
  });
});
