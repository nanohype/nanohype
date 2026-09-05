import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearUserCache, clerkProvider } from "../providers/clerk.js";
import { getProvider } from "../providers/registry.js";
import type { AuthRequest } from "../providers/types.js";

// ── Fakes ───────────────────────────────────────────────────────────
//
// The provider builds its Clerk client inline from the secret key, so the
// backend SDK is the only seam. Replacing it keeps the default test run
// off Clerk's API while leaving the circuit breaker, the TTL cache and the
// LRU eviction under test as they ship.

const { createClerkClient, verifyToken, getUser } = vi.hoisted(() => ({
  createClerkClient: vi.fn(),
  verifyToken: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({ createClerkClient, verifyToken }));

const SECRET = "sk_test_secret";

/** The cache holds this many entries before an insert evicts the oldest. */
const USER_CACHE_MAX_SIZE = 1000;

/** The lifetime of a cache entry, in milliseconds. */
const USER_CACHE_TTL_MS = 60_000;

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

const asUser = (id: string) => fakeRequest({ authorization: `Bearer ${id}` });

/** A Clerk user object with every field the provider reads populated. */
function clerkUser(id: string) {
  return {
    id,
    emailAddresses: [{ emailAddress: `${id}@example.com` }],
    firstName: "Alice",
    lastName: "Zhang",
    publicMetadata: { roles: ["admin"] },
  };
}

describe("clerk provider", () => {
  beforeEach(() => {
    clearUserCache();
    createClerkClient.mockReturnValue({ users: { getUser } });
    verifyToken.mockReset();
    getUser.mockReset();
    // The verified token's subject is the token itself, so each distinct
    // Authorization header resolves to a distinct user.
    verifyToken.mockImplementation(async (token: string) => ({ sub: token }));
    getUser.mockImplementation(async (id: string) => clerkUser(id));
    vi.stubEnv("CLERK_SECRET_KEY", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("self-registers so the registry resolves it by name", () => {
    expect(getProvider("clerk")).toBe(clerkProvider);
    expect(clerkProvider.name).toBe("clerk");
  });

  it("returns authenticated: false when CLERK_SECRET_KEY is unset", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");

    const result = await clerkProvider.verifyRequest(asUser("user-a"));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Clerk provider not configured: set CLERK_SECRET_KEY");
  });

  it("returns authenticated: false when the Authorization header is absent", async () => {
    const result = await clerkProvider.verifyRequest(fakeRequest());

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Authorization header");
  });

  it("strips the Bearer prefix and maps the Clerk user onto the identity shape", async () => {
    const result = await clerkProvider.verifyRequest(asUser("user-a"));

    expect(verifyToken).toHaveBeenCalledWith("user-a", { secretKey: SECRET });
    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("user-a");
    expect(result.user!.email).toBe("user-a@example.com");
    expect(result.user!.name).toBe("Alice Zhang");
    expect(result.user!.roles).toEqual(["admin"]);
    expect(result.user!.metadata.clerkUserId).toBe("user-a");
  });

  it("reads the Authorization header from a plain headers record", async () => {
    const result = await clerkProvider.verifyRequest(plainRequest({ authorization: "user-b" }));

    expect(result.authenticated).toBe(true);
    expect(result.user!.id).toBe("user-b");
  });

  it("serves a repeat request for the same user from the cache", async () => {
    await clerkProvider.verifyRequest(asUser("user-c"));
    getUser.mockClear();

    const result = await clerkProvider.verifyRequest(asUser("user-c"));

    expect(result.user!.id).toBe("user-c");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("refetches the user once the cache entry outlives its TTL", async () => {
    vi.useFakeTimers();
    try {
      await clerkProvider.verifyRequest(asUser("user-d"));
      getUser.mockClear();

      vi.advanceTimersByTime(USER_CACHE_TTL_MS);
      await clerkProvider.verifyRequest(asUser("user-d"));

      expect(getUser).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults email, name and roles when the Clerk user carries none", async () => {
    getUser.mockImplementation(async (id: string) => ({
      id,
      emailAddresses: [],
      firstName: null,
      lastName: null,
    }));

    const result = await clerkProvider.verifyRequest(asUser("user-e"));

    expect(result.authenticated).toBe(true);
    expect(result.user!.email).toBeUndefined();
    expect(result.user!.name).toBeUndefined();
    expect(result.user!.roles).toEqual([]);
  });

  it("evicts the oldest entry when the cache is full", async () => {
    for (let i = 0; i < USER_CACHE_MAX_SIZE; i++) {
      await clerkProvider.verifyRequest(asUser(`user-${i}`));
    }
    getUser.mockClear();

    // Caching one more user pushes the first one out, so a request for it
    // reaches Clerk again.
    await clerkProvider.verifyRequest(asUser(`user-${USER_CACHE_MAX_SIZE}`));
    await clerkProvider.verifyRequest(asUser("user-0"));

    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("surfaces the verification error message when Clerk rejects the token", async () => {
    verifyToken.mockRejectedValue(new Error("token expired"));

    const result = await clerkProvider.verifyRequest(asUser("user-f"));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("token expired");
  });

  it("reports a generic failure when the rejection is not an Error", async () => {
    verifyToken.mockRejectedValue("socket closed");

    const result = await clerkProvider.verifyRequest(asUser("user-g"));

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Clerk verification failed");
  });
});
