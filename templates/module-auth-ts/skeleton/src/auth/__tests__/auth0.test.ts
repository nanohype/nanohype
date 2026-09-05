import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth0Provider } from "../providers/auth0.js";
import { getProvider } from "../providers/registry.js";
import type { AuthRequest } from "../providers/types.js";

// ── Fakes ───────────────────────────────────────────────────────────
//
// The provider builds the JWKS set and calls jwtVerify inline — jose is
// the only seam it exposes. Replacing that module keeps the default test
// run off Auth0's network endpoints.

const { createRemoteJWKSet, jwtVerify } = vi.hoisted(() => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock("jose", () => ({ createRemoteJWKSet, jwtVerify }));

const DOMAIN = "tenant.example.com";
const ISSUER = `https://${DOMAIN}/`;

// ── Helpers ─────────────────────────────────────────────────────────

/** Request whose headers expose the WHATWG-style `get` accessor, as Hono's do. */
function fakeRequest(headers: Record<string, string> = {}): AuthRequest {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
      ...headers,
    },
  };
}

/** Request whose headers are a plain record, as Express supplies. */
function plainRequest(headers: Record<string, unknown>): AuthRequest {
  return { headers: headers as AuthRequest["headers"] };
}

const bearer = () => fakeRequest({ authorization: "Bearer token-abc" });

describe("auth0 provider", () => {
  beforeEach(() => {
    createRemoteJWKSet.mockReset();
    jwtVerify.mockReset();
    createRemoteJWKSet.mockReturnValue("jwks-set");
    vi.stubEnv("AUTH0_DOMAIN", DOMAIN);
    vi.stubEnv("AUTH0_AUDIENCE", "https://api.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("self-registers so the registry resolves it by name", () => {
    expect(getProvider("auth0")).toBe(auth0Provider);
    expect(auth0Provider.name).toBe("auth0");
  });

  it("returns authenticated: false when AUTH0_DOMAIN is unset", async () => {
    vi.stubEnv("AUTH0_DOMAIN", "");

    const result = await auth0Provider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Auth0 provider not configured: set AUTH0_DOMAIN");
  });

  it("returns authenticated: false when no Bearer token is present", async () => {
    const result = await auth0Provider.verifyRequest(fakeRequest());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("returns authenticated: false when the header value is not a string", async () => {
    const result = await auth0Provider.verifyRequest(plainRequest({ authorization: 42 }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("returns authenticated: false for an Authorization header with another scheme", async () => {
    const result = await auth0Provider.verifyRequest(fakeRequest({ authorization: "Basic abc" }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("verifies against the tenant JWKS and maps permissions onto roles", async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        sub: "auth0|123",
        email: "alice@example.com",
        name: "Alice",
        permissions: ["read:reports"],
      },
    });

    const result = await auth0Provider.verifyRequest(
      plainRequest({ authorization: "Bearer token-abc" }),
    );

    expect(createRemoteJWKSet).toHaveBeenCalledWith(new URL(`${ISSUER}.well-known/jwks.json`));
    expect(jwtVerify).toHaveBeenCalledWith("token-abc", "jwks-set", {
      issuer: ISSUER,
      audience: "https://api.example.com",
    });
    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("auth0|123");
    expect(result.user!.email).toBe("alice@example.com");
    expect(result.user!.name).toBe("Alice");
    expect(result.user!.roles).toEqual(["read:reports"]);
  });

  it("falls back to the namespaced roles claim when permissions are absent", async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: "auth0|456", [`${ISSUER}roles`]: ["editor"] },
    });

    const result = await auth0Provider.verifyRequest(bearer());

    expect(result.authenticated).toBe(true);
    expect(result.user!.roles).toEqual(["editor"]);
  });

  it("defaults identity and roles when the token carries neither claim", async () => {
    jwtVerify.mockResolvedValue({ payload: {} });

    const result = await auth0Provider.verifyRequest(bearer());

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("unknown");
    expect(result.user!.email).toBeUndefined();
    expect(result.user!.name).toBeUndefined();
    expect(result.user!.roles).toEqual([]);
  });

  it("surfaces the verification error message when jose rejects", async () => {
    jwtVerify.mockRejectedValue(new Error("signature verification failed"));

    const result = await auth0Provider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("signature verification failed");
  });

  it("reports a generic failure when the rejection is not an Error", async () => {
    jwtVerify.mockRejectedValue("jwks unreachable");

    const result = await auth0Provider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Auth0 verification failed");
  });
});
