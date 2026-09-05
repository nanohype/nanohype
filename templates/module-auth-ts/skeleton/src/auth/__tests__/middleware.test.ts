import { describe, expect, it, vi } from "vitest";
import {
  AUTH_RESULT_KEY,
  AUTH_USER_KEY,
  type AuthenticatedRequest,
  createAuthMiddleware,
  getAuthResult,
  getAuthUser,
} from "../middleware.js";
import { registerProvider } from "../providers/registry.js";
import type { AuthProvider, AuthRequest } from "../providers/types.js";
import type { AuthResult, AuthUser } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────
//
// The middleware reaches its provider through the registry, so a stub
// registered under a unique name exercises the framework adapters without
// any provider's backing service.

const USER: AuthUser = { id: "u1", roles: ["admin"], metadata: {} };

let stubCount = 0;

/**
 * Register a stub provider and return its name plus the Authorization
 * header values the middleware handed it.
 */
function registerStub(respond: (request: AuthRequest) => Promise<AuthResult>) {
  stubCount += 1;
  const name = `middleware-stub-${stubCount}`;
  const seen: (string | null | undefined)[] = [];
  const provider: AuthProvider = {
    name,
    async verifyRequest(request) {
      seen.push(request.headers.get!("authorization"));
      return respond(request);
    },
  };
  registerProvider(name, () => provider);
  return { name, seen };
}

const resolving = (result: AuthResult) => async () => result;

/** Minimal Hono context: `.req` with a header accessor, `.json`, and `.set`. */
function honoContext(headers: Record<string, string> = {}) {
  const raw = {} as AuthenticatedRequest;
  const set = vi.fn();
  const c = {
    req: {
      raw,
      header: (name: string) => headers[name.toLowerCase()],
    },
    json: vi.fn(),
    set,
  };
  const next = vi.fn(async () => undefined);
  return { c, raw, set, next };
}

/** Minimal Express triple: a request with a headers record, a response, a next. */
function expressArgs(headers: Record<string, string> = {}) {
  const req = { headers } as Record<string, unknown> & AuthenticatedRequest;
  const res = {};
  const next = vi.fn();
  return { req, res, next };
}

// ── Provider resolution ────────────────────────────────────────────────

describe("createAuthMiddleware — provider resolution", () => {
  it("throws naming the registered providers when the configured one is absent", async () => {
    const middleware = createAuthMiddleware({ provider: "no-such-provider" });

    await expect(middleware()).rejects.toThrow(
      /Auth provider "no-such-provider" not found\. Available: /,
    );
  });

  it("throws when the calling framework cannot be detected", async () => {
    const { name } = registerStub(resolving({ authenticated: true, user: USER }));
    const middleware = createAuthMiddleware({ provider: name });

    await expect(middleware({}, {}, {})).rejects.toThrow(/could not detect framework/);
  });

  it("throws when invoked with no arguments at all", async () => {
    const { name } = registerStub(resolving({ authenticated: true, user: USER }));
    const middleware = createAuthMiddleware({ provider: name });

    await expect(middleware()).rejects.toThrow(/could not detect framework/);
  });
});

// ── Hono ───────────────────────────────────────────────────────────────

describe("createAuthMiddleware — Hono", () => {
  it("attaches user and result to the raw request and the context", async () => {
    const result: AuthResult = { authenticated: true, user: USER };
    const { name, seen } = registerStub(resolving(result));
    const { c, raw, set, next } = honoContext({ authorization: "Bearer t" });

    await createAuthMiddleware({ provider: name })(c, next);

    expect(seen).toEqual(["Bearer t"]);
    expect(raw[AUTH_RESULT_KEY]).toBe(result);
    expect(raw[AUTH_USER_KEY]).toBe(USER);
    expect(set).toHaveBeenCalledWith("authUser", USER);
    expect(set).toHaveBeenCalledWith("authResult", result);
    expect(next).toHaveBeenCalledOnce();
  });

  it("passes null to the provider when the header is absent", async () => {
    const { name, seen } = registerStub(resolving({ authenticated: false, error: "no token" }));
    const { c, next } = honoContext();

    await createAuthMiddleware({ provider: name })(c, next);

    expect(seen).toEqual([null]);
  });

  it("attaches the result but no user when verification fails", async () => {
    const result: AuthResult = { authenticated: false, error: "no token" };
    const { name } = registerStub(resolving(result));
    const { c, raw, set, next } = honoContext();

    await createAuthMiddleware({ provider: name })(c, next);

    expect(raw[AUTH_RESULT_KEY]).toBe(result);
    expect(raw[AUTH_USER_KEY]).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("attaches no user when a provider reports success without one", async () => {
    const { name } = registerStub(resolving({ authenticated: true }));
    const { c, raw, set, next } = honoContext({ authorization: "Bearer t" });

    await createAuthMiddleware({ provider: name })(c, next);

    expect(raw[AUTH_USER_KEY]).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});

// ── Express ────────────────────────────────────────────────────────────

describe("createAuthMiddleware — Express", () => {
  it("attaches user and result to the request and calls next", async () => {
    const result: AuthResult = { authenticated: true, user: USER };
    const { name, seen } = registerStub(resolving(result));
    const { req, res, next } = expressArgs({ authorization: "Bearer t" });

    await createAuthMiddleware({ provider: name })(req, res, next);

    expect(seen).toEqual(["Bearer t"]);
    expect(req[AUTH_RESULT_KEY]).toBe(result);
    expect(req[AUTH_USER_KEY]).toBe(USER);
    expect(req.authUser).toBe(USER);
    expect(req.authResult).toBe(result);
    expect(next).toHaveBeenCalledWith();
  });

  it("passes null to the provider when the header is absent", async () => {
    const { name, seen } = registerStub(resolving({ authenticated: false, error: "no token" }));
    const { req, res, next } = expressArgs();

    await createAuthMiddleware({ provider: name })(req, res, next);

    expect(seen).toEqual([null]);
  });

  it("attaches the result but no user when verification fails", async () => {
    const result: AuthResult = { authenticated: false, error: "no token" };
    const { name } = registerStub(resolving(result));
    const { req, res, next } = expressArgs();

    await createAuthMiddleware({ provider: name })(req, res, next);

    expect(req[AUTH_RESULT_KEY]).toBe(result);
    expect(req[AUTH_USER_KEY]).toBeUndefined();
    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("attaches no user when a provider reports success without one", async () => {
    const { name } = registerStub(resolving({ authenticated: true }));
    const { req, res, next } = expressArgs({ authorization: "Bearer t" });

    await createAuthMiddleware({ provider: name })(req, res, next);

    expect(req[AUTH_USER_KEY]).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("forwards a provider failure to next as an error", async () => {
    const boom = new Error("provider exploded");
    const { name } = registerStub(async () => {
      throw boom;
    });
    const { req, res, next } = expressArgs({ authorization: "Bearer t" });

    await createAuthMiddleware({ provider: name })(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(req[AUTH_RESULT_KEY]).toBeUndefined();
  });
});

// ── Accessors ──────────────────────────────────────────────────────────

describe("getAuthUser / getAuthResult", () => {
  it("return undefined for a request middleware has not touched", () => {
    expect(getAuthUser({})).toBeUndefined();
    expect(getAuthResult({})).toBeUndefined();
  });

  it("return what the middleware attached", async () => {
    const result: AuthResult = { authenticated: true, user: USER };
    const { name } = registerStub(resolving(result));
    const { req, res, next } = expressArgs({ authorization: "Bearer t" });

    await createAuthMiddleware({ provider: name })(req, res, next);

    expect(getAuthUser(req)).toBe(USER);
    expect(getAuthResult(req)).toBe(result);
  });
});
