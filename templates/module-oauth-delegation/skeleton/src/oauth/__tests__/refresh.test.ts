import { beforeEach, describe, expect, it, vi } from "vitest";

import { TokenRefresher } from "../refresh.js";
import { InMemoryTokenStorage } from "../storage/memory.js";
import type { OAuthProvider, RevocationEmitter } from "../types.js";

function testProvider(): OAuthProvider {
  return {
    name: "test",
    authUrl: "https://example.com/authorize?state={state}",
    tokenUrl: "https://example.com/token",
    revokeUrl: "https://example.com/revoke",
    defaultScopes: ["read"],
    usePkce: true,
    parseTokenResponse(raw) {
      const r = raw as { access_token: string; refresh_token?: string; expires_in?: number };
      return {
        accessToken: r.access_token,
        refreshToken: r.refresh_token,
        expiresAt: r.expires_in ? 2_000_000_000 + r.expires_in : undefined,
      };
    },
  };
}

function tokenResponse(body: object, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? status : status,
    headers: { "content-type": "application/json" },
  });
}

function creds() {
  return {
    test: { clientId: "id", clientSecret: "secret", redirectUri: "https://app/cb" },
  };
}

describe("TokenRefresher.getValidToken", () => {
  let storage: InMemoryTokenStorage;
  let emitted: Array<{ userId: string; provider: string; reason: string }>;
  let emitter: RevocationEmitter;

  beforeEach(() => {
    storage = new InMemoryTokenStorage();
    emitted = [];
    emitter = {
      async emit(event) {
        emitted.push(event);
      },
    };
  });

  it("returns stored token when not expiring", async () => {
    await storage.put("u1", "test", {
      accessToken: "current",
      refreshToken: "r",
      expiresAt: 9_999_999_999,
    });
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, now: () => 1_000 },
      60,
    );
    expect(await refresher.getValidToken("u1", "test")).toBe("current");
  });

  it("returns null when no grant stored", async () => {
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, now: () => 1_000 },
      60,
    );
    expect(await refresher.getValidToken("u1", "test")).toBeNull();
  });

  it("refreshes when expiresAt is within lead time, passes AbortSignal to fetch", async () => {
    await storage.put("u1", "test", {
      accessToken: "old",
      refreshToken: "r1",
      expiresAt: 1_000 + 30, // within 60s lead
    });
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      tokenResponse({ access_token: "new", expires_in: 3600 }),
    );
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, fetchImpl, now: () => 1_000 },
      60,
    );
    expect(await refresher.getValidToken("u1", "test")).toBe("new");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const stored = await storage.get("u1", "test");
    expect(stored?.accessToken).toBe("new");
    expect(stored?.refreshToken).toBe("r1"); // reused

    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("deletes and emits on refresh rejection", async () => {
    await storage.put("u1", "test", {
      accessToken: "old",
      refreshToken: "r1",
      expiresAt: 1_000 + 10,
    });
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 401 }));
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, emitter, fetchImpl, now: () => 1_000 },
      60,
    );
    expect(await refresher.getValidToken("u1", "test")).toBeNull();
    expect(await storage.get("u1", "test")).toBeNull();
    expect(emitted).toEqual([{ userId: "u1", provider: "test", reason: "refresh-failed" }]);
  });

  it("deletes and emits on refresh network error", async () => {
    await storage.put("u1", "test", {
      accessToken: "old",
      refreshToken: "r1",
      expiresAt: 1_000 + 10,
    });
    const fetchImpl = vi.fn(async () => {
      throw new Error("econnreset");
    });
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, emitter, fetchImpl, now: () => 1_000 },
      60,
    );
    expect(await refresher.getValidToken("u1", "test")).toBeNull();
    expect(emitted[0].reason).toBe("refresh-failed");
  });

  it("does not retry on failure — one attempt only", async () => {
    await storage.put("u1", "test", {
      accessToken: "old",
      refreshToken: "r1",
      expiresAt: 1_000 + 10,
    });
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, emitter, fetchImpl, now: () => 1_000 },
      60,
    );
    await refresher.getValidToken("u1", "test");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent refreshes for the same key", async () => {
    await storage.put("u1", "test", {
      accessToken: "old",
      refreshToken: "r1",
      expiresAt: 1_000 + 10,
    });
    let resolve: ((r: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((r) => {
      resolve = r;
    });
    const fetchImpl = vi.fn(async () => firstResponse);
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, fetchImpl, now: () => 1_000 },
      60,
    );

    const a = refresher.getValidToken("u1", "test");
    const b = refresher.getValidToken("u1", "test");
    const c = refresher.getValidToken("u1", "test");

    // Allow the inflight map to be populated before resolving.
    await new Promise((r) => setImmediate(r));

    resolve!(tokenResponse({ access_token: "new", expires_in: 3600 }));

    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra).toBe("new");
    expect(rb).toBe("new");
    expect(rc).toBe("new");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns existing grant when no refresh token present", async () => {
    await storage.put("u1", "test", {
      accessToken: "still-valid",
      expiresAt: 1_000 + 10, // expiring, but no refresh token
    });
    const fetchImpl = vi.fn();
    const refresher = new TokenRefresher(
      { test: testProvider() },
      creds(),
      { storage, fetchImpl, now: () => 1_000 },
      60,
    );
    expect(await refresher.getValidToken("u1", "test")).toBe("still-valid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
