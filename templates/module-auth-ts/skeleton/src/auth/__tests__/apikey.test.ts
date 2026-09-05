import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apikeyProvider } from "../providers/apikey.js";
import { getProvider } from "../providers/registry.js";
import type { AuthRequest } from "../providers/types.js";

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

describe("apikey provider", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_API_KEYS", "sk-admin:admin+editor:production,sk-reader");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("self-registers so the registry resolves it by name", () => {
    expect(getProvider("apikey")).toBe(apikeyProvider);
    expect(apikeyProvider.name).toBe("apikey");
  });

  it("returns authenticated: false when AUTH_API_KEYS is unset", async () => {
    vi.stubEnv("AUTH_API_KEYS", "");

    const result = await apikeyProvider.verifyRequest(fakeRequest({ "x-api-key": "sk-admin" }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("API key provider not configured: set AUTH_API_KEYS");
  });

  it("returns authenticated: false when the request carries no key", async () => {
    const result = await apikeyProvider.verifyRequest(fakeRequest());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing API key (send via X-API-Key header or Bearer token)");
  });

  it("accepts a key from the X-API-Key header and maps its roles and label", async () => {
    const result = await apikeyProvider.verifyRequest(fakeRequest({ "x-api-key": "sk-admin" }));

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("apikey:production");
    expect(result.user!.roles).toEqual(["admin", "editor"]);
    expect(result.user!.metadata).toEqual({ keyLabel: "production", authMethod: "apikey" });
  });

  it("falls back to the Bearer token when X-API-Key is absent", async () => {
    const result = await apikeyProvider.verifyRequest(
      fakeRequest({ authorization: "Bearer sk-admin" }),
    );

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("apikey:production");
  });

  it("reads the key from a plain headers record", async () => {
    const result = await apikeyProvider.verifyRequest(plainRequest({ "x-api-key": "sk-admin" }));

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("apikey:production");
  });

  it("ignores a non-string X-API-Key and falls through to the Bearer token", async () => {
    const result = await apikeyProvider.verifyRequest(
      plainRequest({ "x-api-key": 42, authorization: "Bearer sk-admin" }),
    );

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("apikey:production");
  });

  it("returns authenticated: false when the Authorization header is not a string", async () => {
    const result = await apikeyProvider.verifyRequest(plainRequest({ authorization: 42 }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing API key (send via X-API-Key header or Bearer token)");
  });

  it("returns authenticated: false for an Authorization header with another scheme", async () => {
    const result = await apikeyProvider.verifyRequest(
      fakeRequest({ authorization: "Basic sk-admin" }),
    );

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing API key (send via X-API-Key header or Bearer token)");
  });

  it("defaults roles to empty and the label to 'unnamed' for a bare key entry", async () => {
    const result = await apikeyProvider.verifyRequest(fakeRequest({ "x-api-key": "sk-reader" }));

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("apikey:unnamed");
    expect(result.user!.roles).toEqual([]);
  });

  it("drops empty entries and empty role segments while parsing the key list", async () => {
    vi.stubEnv("AUTH_API_KEYS", " , sk-ops:ops+:operations , ");

    const result = await apikeyProvider.verifyRequest(fakeRequest({ "x-api-key": "sk-ops" }));

    expect(result.authenticated).toBe(true);
    expect(result.user!.roles).toEqual(["ops"]);
  });

  it("rejects a key of the same length as a configured one", async () => {
    const result = await apikeyProvider.verifyRequest(fakeRequest({ "x-api-key": "sk-admiN" }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Invalid API key");
  });

  it("rejects a key whose length matches no configured key", async () => {
    const result = await apikeyProvider.verifyRequest(fakeRequest({ "x-api-key": "sk" }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Invalid API key");
  });
});
