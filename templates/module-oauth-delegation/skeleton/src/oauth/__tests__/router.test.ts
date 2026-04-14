import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOAuthRouter } from "../router.js";
import { STATE_COOKIE_NAME, signState, type StatePayload } from "../state.js";
import { InMemoryTokenStorage } from "../storage/memory.js";
import type { OAuthProvider, OAuthRouterConfig, RevocationEmitter } from "../types.js";

const SECRET = "test-state-signing-secret-min-16-chars";

function fakeProvider(): OAuthProvider {
  return {
    name: "test",
    authUrl:
      "https://provider.example/authorize" +
      "?client_id={client_id}" +
      "&redirect_uri={redirect_uri}" +
      "&scope={scope}" +
      "&state={state}" +
      "&code_challenge={code_challenge}" +
      "&code_challenge_method={code_challenge_method}",
    tokenUrl: "https://provider.example/token",
    revokeUrl: "https://provider.example/revoke",
    defaultScopes: ["read"],
    usePkce: true,
    parseTokenResponse(raw) {
      const r = raw as { access_token: string; refresh_token?: string; expires_in?: number };
      return {
        accessToken: r.access_token,
        refreshToken: r.refresh_token,
        expiresAt: r.expires_in ? 1_000 + r.expires_in : undefined,
      };
    },
  };
}

function makeConfig(
  storage: InMemoryTokenStorage,
  overrides: Partial<OAuthRouterConfig> = {},
): OAuthRouterConfig {
  return {
    providers: { test: fakeProvider() },
    storage,
    stateSigningSecret: SECRET,
    resolveUserId: async (req) => req.headers.get("x-user-id"),
    clientCredentials: {
      test: { clientId: "cid", clientSecret: "csec", redirectUri: "https://app/cb" },
    },
    ...overrides,
  };
}

function tokenResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function signedStateFor(overrides: Partial<StatePayload> = {}, createdAt = 1_000): string {
  const payload: StatePayload = {
    nonce: "abc",
    userId: "u1",
    provider: "test",
    returnTo: "/done",
    createdAt,
    codeVerifier: "v".repeat(43),
    ...overrides,
  };
  return signState(payload, SECRET);
}

describe("createOAuthRouter", () => {
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

  describe("start", () => {
    it("redirects with signed state cookie and PKCE challenge", async () => {
      const router = createOAuthRouter(makeConfig(storage));
      const req = new Request("https://app.example/oauth/test/start?returnTo=/after", {
        headers: { "x-user-id": "u1" },
      });
      const res = await router.handlers.start(req);
      expect(res.status).toBe(302);
      const location = res.headers.get("location")!;
      expect(location).toContain("client_id=cid");
      expect(location).toContain("scope=read");
      expect(location).toContain("code_challenge_method=S256");
      expect(location).toMatch(/code_challenge=[A-Za-z0-9%_-]+/);
      const setCookie = res.headers.get("set-cookie")!;
      expect(setCookie).toContain(`${STATE_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
    });

    it("401s when the caller is unauthenticated", async () => {
      const router = createOAuthRouter(makeConfig(storage));
      const req = new Request("https://app.example/oauth/test/start");
      const res = await router.handlers.start(req);
      expect(res.status).toBe(401);
    });

    it("404s for unknown provider", async () => {
      const router = createOAuthRouter(makeConfig(storage));
      const req = new Request("https://app.example/oauth/unknown/start", {
        headers: { "x-user-id": "u1" },
      });
      const res = await router.handlers.start(req);
      expect(res.status).toBe(404);
    });

    it("rejects an absolute returnTo and falls back to /", async () => {
      const router = createOAuthRouter(makeConfig(storage), { now: () => 1_000 });
      const req = new Request(
        "https://app.example/oauth/test/start?returnTo=https://evil.example/harvest",
        { headers: { "x-user-id": "u1" } },
      );
      const res = await router.handlers.start(req);
      expect(res.status).toBe(302);
      // Pull the signed state cookie, verify its returnTo did not pick up the evil URL.
      const setCookie = res.headers.get("set-cookie")!;
      const value = setCookie.split(";")[0].split("=").slice(1).join("=");
      const [body] = value.split(".");
      const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
      const decoded = Buffer.from(
        body.replace(/-/g, "+").replace(/_/g, "/") + pad,
        "base64",
      ).toString("utf-8");
      expect(JSON.parse(decoded).returnTo).toBe("/");
    });

    it("rejects a protocol-relative returnTo", async () => {
      const router = createOAuthRouter(makeConfig(storage), { now: () => 1_000 });
      const req = new Request(
        "https://app.example/oauth/test/start?returnTo=//evil.example/steal",
        { headers: { "x-user-id": "u1" } },
      );
      const res = await router.handlers.start(req);
      expect(res.status).toBe(302);
      const setCookie = res.headers.get("set-cookie")!;
      const value = setCookie.split(";")[0].split("=").slice(1).join("=");
      const [body] = value.split(".");
      const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
      const decoded = Buffer.from(
        body.replace(/-/g, "+").replace(/_/g, "/") + pad,
        "base64",
      ).toString("utf-8");
      expect(JSON.parse(decoded).returnTo).toBe("/");
    });
  });

  describe("callback", () => {
    it("exchanges code, stores tokens, redirects to returnTo", async () => {
      const fetchImpl = vi.fn<typeof fetch>(
        async () => tokenResponse({ access_token: "A", refresh_token: "R", expires_in: 3600 }),
      );
      const router = createOAuthRouter(makeConfig(storage), { fetchImpl, now: () => 1_000 });

      const signed = signedStateFor({ nonce: "abc" }, 1_000);
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=abc",
        {
          headers: {
            "x-user-id": "u1",
            cookie: `${STATE_COOKIE_NAME}=${signed}`,
          },
        },
      );
      const res = await router.handlers.callback(req);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/done");

      const stored = await storage.get("u1", "test");
      expect(stored?.accessToken).toBe("A");
      expect(stored?.refreshToken).toBe("R");

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [, init] = fetchImpl.mock.calls[0];
      const body = (init?.body as URLSearchParams).toString();
      expect(body).toContain("code=XYZ");
      expect(body).toContain("code_verifier=");
    });

    it("rejects a tampered state cookie with 400", async () => {
      const router = createOAuthRouter(makeConfig(storage), { now: () => 1_000 });
      const signed = signedStateFor({ nonce: "abc" }, 1_000);
      const tampered = `${signed}XX`;
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=abc",
        {
          headers: {
            "x-user-id": "u1",
            cookie: `${STATE_COOKIE_NAME}=${tampered}`,
          },
        },
      );
      const res = await router.handlers.callback(req);
      expect(res.status).toBe(400);
    });

    it("rejects an expired state cookie with 400", async () => {
      const router = createOAuthRouter(makeConfig(storage), { now: () => 10_000 });
      const signed = signedStateFor({ nonce: "abc" }, 1_000); // ~9000s old
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=abc",
        {
          headers: {
            "x-user-id": "u1",
            cookie: `${STATE_COOKIE_NAME}=${signed}`,
          },
        },
      );
      const res = await router.handlers.callback(req);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("state_expired");
    });

    it("rejects when the caller's userId does not match state.userId", async () => {
      const router = createOAuthRouter(makeConfig(storage), { now: () => 1_000 });
      const signed = signedStateFor({ nonce: "abc", userId: "u1" }, 1_000);
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=abc",
        {
          headers: {
            "x-user-id": "u2", // different from u1
            cookie: `${STATE_COOKIE_NAME}=${signed}`,
          },
        },
      );
      const res = await router.handlers.callback(req);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("user_mismatch");
    });

    it("rejects when the nonce in query does not match state", async () => {
      const router = createOAuthRouter(makeConfig(storage), { now: () => 1_000 });
      const signed = signedStateFor({ nonce: "abc" }, 1_000);
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=different",
        {
          headers: {
            "x-user-id": "u1",
            cookie: `${STATE_COOKIE_NAME}=${signed}`,
          },
        },
      );
      const res = await router.handlers.callback(req);
      expect(res.status).toBe(400);
    });

    it("sends code_verifier in the token exchange body", async () => {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        tokenResponse({ access_token: "A", expires_in: 3600 }),
      );
      const router = createOAuthRouter(makeConfig(storage), { fetchImpl, now: () => 1_000 });
      const signed = signedStateFor({ nonce: "abc", codeVerifier: "my-verifier-value" }, 1_000);
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=abc",
        {
          headers: {
            "x-user-id": "u1",
            cookie: `${STATE_COOKIE_NAME}=${signed}`,
          },
        },
      );
      await router.handlers.callback(req);
      const [, init] = fetchImpl.mock.calls[0];
      const body = (init?.body as URLSearchParams).toString();
      expect(body).toContain("code_verifier=my-verifier-value");
    });

    it("passes an AbortSignal to the token endpoint fetch", async () => {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        tokenResponse({ access_token: "A", expires_in: 3600 }),
      );
      const router = createOAuthRouter(makeConfig(storage), { fetchImpl, now: () => 1_000 });
      const signed = signedStateFor({ nonce: "abc" }, 1_000);
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=abc",
        {
          headers: {
            "x-user-id": "u1",
            cookie: `${STATE_COOKIE_NAME}=${signed}`,
          },
        },
      );
      await router.handlers.callback(req);
      const [, init] = fetchImpl.mock.calls[0];
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("returns 502 when the provider rejects the code exchange", async () => {
      const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
      const router = createOAuthRouter(makeConfig(storage), { fetchImpl, now: () => 1_000 });
      const signed = signedStateFor({ nonce: "abc" }, 1_000);
      const req = new Request(
        "https://app.example/oauth/test/callback?code=XYZ&state=abc",
        {
          headers: {
            "x-user-id": "u1",
            cookie: `${STATE_COOKIE_NAME}=${signed}`,
          },
        },
      );
      const res = await router.handlers.callback(req);
      expect(res.status).toBe(502);
    });
  });

  describe("getValidToken", () => {
    it("triggers refresh when stored token is expiring", async () => {
      const fetchImpl = vi.fn(
        async () => tokenResponse({ access_token: "refreshed", expires_in: 3600 }),
      );
      const router = createOAuthRouter(makeConfig(storage, { revocationEmitter: emitter }), {
        fetchImpl,
        now: () => 1_000,
      });
      await storage.put("u1", "test", {
        accessToken: "old",
        refreshToken: "r1",
        expiresAt: 1_010,
      });
      const token = await router.getValidToken("u1", "test");
      expect(token).toBe("refreshed");
      expect((await storage.get("u1", "test"))!.accessToken).toBe("refreshed");
    });

    it("returns null and purges storage when refresh fails", async () => {
      const fetchImpl = vi.fn(async () => new Response("bad", { status: 401 }));
      const router = createOAuthRouter(makeConfig(storage, { revocationEmitter: emitter }), {
        fetchImpl,
        now: () => 1_000,
      });
      await storage.put("u1", "test", {
        accessToken: "old",
        refreshToken: "r1",
        expiresAt: 1_010,
      });
      const token = await router.getValidToken("u1", "test");
      expect(token).toBeNull();
      expect(await storage.get("u1", "test")).toBeNull();
      expect(emitted[0].reason).toBe("refresh-failed");
    });

    it("returns null when provider is unknown", async () => {
      const router = createOAuthRouter(makeConfig(storage));
      expect(await router.getValidToken("u1", "never-registered")).toBeNull();
    });
  });

  describe("revocation", () => {
    it("revokeTokens deletes stored grant and emits event", async () => {
      const router = createOAuthRouter(makeConfig(storage, { revocationEmitter: emitter }));
      await storage.put("u1", "test", { accessToken: "A" });
      await router.revokeTokens("u1", "test");
      expect(await storage.get("u1", "test")).toBeNull();
      expect(emitted).toEqual([{ userId: "u1", provider: "test", reason: "user" }]);
    });

    it("revokeAllForUser wipes the user and emits per provider with offboarding reason", async () => {
      const router = createOAuthRouter(makeConfig(storage, { revocationEmitter: emitter }));
      await storage.put("u1", "test", { accessToken: "A" });
      await router.revokeAllForUser("u1");
      expect(await storage.get("u1", "test")).toBeNull();
      expect(emitted).toEqual([{ userId: "u1", provider: "test", reason: "offboarding" }]);
    });

    it("revoke handler calls provider revoke URL and deletes", async () => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
      const router = createOAuthRouter(
        makeConfig(storage, { revocationEmitter: emitter }),
        { fetchImpl },
      );
      await storage.put("u1", "test", { accessToken: "A" });
      const req = new Request("https://app.example/oauth/test/revoke", {
        method: "POST",
        headers: { "x-user-id": "u1" },
      });
      const res = await router.handlers.revoke(req);
      expect(res.status).toBe(204);
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://provider.example/revoke",
        expect.objectContaining({ method: "POST" }),
      );
      expect(await storage.get("u1", "test")).toBeNull();
      expect(emitted[0].reason).toBe("user");
    });
  });

  describe("refresh handler", () => {
    it("forces a refresh for the given user+provider", async () => {
      const fetchImpl = vi.fn(async () =>
        tokenResponse({ access_token: "forced", expires_in: 3600 }),
      );
      const router = createOAuthRouter(makeConfig(storage), { fetchImpl, now: () => 1_000 });
      await storage.put("u1", "test", {
        accessToken: "old",
        refreshToken: "r1",
        expiresAt: 9_999_999_999, // not expiring, but refresh handler forces it
      });
      const req = new Request("https://app.example/oauth/test/refresh", {
        method: "POST",
        headers: { "x-user-id": "u1" },
      });
      const res = await router.handlers.refresh(req);
      expect(res.status).toBe(200);
      expect((await storage.get("u1", "test"))!.accessToken).toBe("forced");
    });
  });

  it("throws when stateSigningSecret is too short", () => {
    expect(() =>
      createOAuthRouter(makeConfig(new InMemoryTokenStorage(), { stateSigningSecret: "short" })),
    ).toThrow(/at least 16/);
  });
});
