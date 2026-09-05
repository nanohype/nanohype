import { describe, expect, it } from "vitest";
import { mockProvider } from "../providers/mock.js";
import { getProvider } from "../providers/registry.js";
import type { AuthRequest } from "../providers/types.js";

// ── Helpers ─────────────────────────────────────────────────────────

/** Request whose headers expose the WHATWG-style `get` accessor, as Hono's do. */
function fakeRequest(token?: string): AuthRequest {
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

/** Request whose headers are a plain record, as Express supplies. */
function plainRequest(headers: Record<string, unknown>): AuthRequest {
  return { headers: headers as AuthRequest["headers"] };
}

describe("mock provider", () => {
  it("self-registers so the registry resolves it by name", () => {
    expect(getProvider("mock")).toBe(mockProvider);
    expect(mockProvider.name).toBe("mock");
  });

  it("returns authenticated: false when no Bearer token is present", async () => {
    const result = await mockProvider.verifyRequest(fakeRequest());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("reads the Authorization header from a plain headers record", async () => {
    const result = await mockProvider.verifyRequest(
      plainRequest({ authorization: "Bearer mock-user-9" }),
    );

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("user-9");
  });

  it("returns authenticated: false when the header value is not a string", async () => {
    const result = await mockProvider.verifyRequest(plainRequest({ authorization: 42 }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("returns authenticated: false for an Authorization header with another scheme", async () => {
    const result = await mockProvider.verifyRequest(plainRequest({ authorization: "Basic abc" }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("rejects a token outside the mock- pattern", async () => {
    const result = await mockProvider.verifyRequest(fakeRequest("real-token"));

    expect(result.authenticated).toBe(false);
    expect(result.error).toMatch(/mock-\*/);
  });

  it("derives the user identity from the token suffix", async () => {
    const result = await mockProvider.verifyRequest(fakeRequest("mock-user-123"));

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("user-123");
    expect(result.user!.email).toBe("user-123@mock.local");
    expect(result.user!.name).toBe("Mock User (user-123)");
    expect(result.user!.roles).toEqual(["user"]);
    expect(result.user!.metadata).toEqual({ provider: "mock", token: "mock-user-123" });
  });
});
