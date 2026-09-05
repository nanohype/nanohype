import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "../providers/registry.js";
import { supabaseProvider } from "../providers/supabase.js";
import type { AuthRequest } from "../providers/types.js";

// ── Fakes ───────────────────────────────────────────────────────────
//
// The provider constructs its client inline from environment variables,
// so the SDK module is the only seam. Replacing it keeps the default
// test run off the Supabase project endpoint.

const { createClient, getUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

const URL_ = "https://project.supabase.co";
const ANON_KEY = "anon-key";

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

describe("supabase provider", () => {
  beforeEach(() => {
    createClient.mockReset();
    getUser.mockReset();
    createClient.mockReturnValue({ auth: { getUser } });
    vi.stubEnv("SUPABASE_URL", URL_);
    vi.stubEnv("SUPABASE_ANON_KEY", ANON_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("self-registers so the registry resolves it by name", () => {
    expect(getProvider("supabase")).toBe(supabaseProvider);
    expect(supabaseProvider.name).toBe("supabase");
  });

  it("returns authenticated: false when SUPABASE_URL is unset", async () => {
    vi.stubEnv("SUPABASE_URL", "");

    const result = await supabaseProvider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toMatch(/not configured/);
  });

  it("returns authenticated: false when SUPABASE_ANON_KEY is unset", async () => {
    vi.stubEnv("SUPABASE_ANON_KEY", "");

    const result = await supabaseProvider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toMatch(/not configured/);
  });

  it("returns authenticated: false when no Bearer token is present", async () => {
    const result = await supabaseProvider.verifyRequest(fakeRequest());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("returns authenticated: false when the header value is not a string", async () => {
    const result = await supabaseProvider.verifyRequest(plainRequest({ authorization: 42 }));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("returns authenticated: false for an Authorization header with another scheme", async () => {
    const result = await supabaseProvider.verifyRequest(
      fakeRequest({ authorization: "Basic abc" }),
    );

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Bearer token");
  });

  it("maps the Supabase user onto the common identity shape", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "sb-1",
          email: "alice@example.com",
          user_metadata: { full_name: "Alice" },
          app_metadata: { roles: ["admin"] },
        },
      },
      error: null,
    });

    const result = await supabaseProvider.verifyRequest(
      plainRequest({ authorization: "Bearer token-abc" }),
    );

    expect(createClient).toHaveBeenCalledWith(URL_, ANON_KEY);
    expect(getUser).toHaveBeenCalledWith("token-abc");
    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("sb-1");
    expect(result.user!.email).toBe("alice@example.com");
    expect(result.user!.name).toBe("Alice");
    expect(result.user!.roles).toEqual(["admin"]);
    expect(result.user!.metadata.supabaseUserId).toBe("sb-1");
  });

  it("defaults name and roles when the user carries no metadata", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "sb-2", email: undefined } }, error: null });

    const result = await supabaseProvider.verifyRequest(bearer());

    expect(result.authenticated).toBe(true);
    expect(result.user!.name).toBeUndefined();
    expect(result.user!.roles).toEqual([]);
  });

  it("surfaces the Supabase error message when the token is rejected", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid claim: exp" } });

    const result = await supabaseProvider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("invalid claim: exp");
  });

  it("reports an invalid token when Supabase returns neither user nor error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await supabaseProvider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Invalid Supabase token");
  });

  it("surfaces the thrown message when the client fails", async () => {
    getUser.mockRejectedValue(new Error("fetch failed"));

    const result = await supabaseProvider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("fetch failed");
  });

  it("reports a generic failure when the rejection is not an Error", async () => {
    getUser.mockRejectedValue("socket closed");

    const result = await supabaseProvider.verifyRequest(bearer());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Supabase verification failed");
  });
});
