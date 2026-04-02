import { describe, it, expect, vi } from "vitest";
import { requireAuth, requireRole } from "../guards.js";
import { AUTH_USER_KEY, AUTH_RESULT_KEY } from "../middleware.js";
import type { AuthResult, AuthUser } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────
//
// Build fake Express-style req/res/next triples so we can invoke guards
// without a real HTTP server.

function fakeExpressArgs(options: {
  result?: AuthResult;
  user?: AuthUser;
}) {
  const req: Record<string | symbol, unknown> = {
    headers: { authorization: "Bearer test" },
  };
  if (options.result) {
    req[AUTH_RESULT_KEY] = options.result;
  }
  if (options.user) {
    req[AUTH_USER_KEY] = options.user;
  }

  let statusCode = 0;
  let body: unknown = undefined;
  const res = {
    status(code: number) {
      statusCode = code;
      return {
        json(data: unknown) {
          body = data;
        },
      };
    },
  };

  const next = vi.fn();

  return { req, res, next, getStatus: () => statusCode, getBody: () => body };
}

// ── requireAuth ────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("returns 401 when no auth result is present", async () => {
    const { req, res, next, getStatus, getBody } = fakeExpressArgs({});

    await requireAuth(req, res, next);

    expect(getStatus()).toBe(401);
    expect(getBody()).toEqual({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when auth result is not authenticated", async () => {
    const { req, res, next, getStatus, getBody } = fakeExpressArgs({
      result: { authenticated: false, error: "Invalid token" },
    });

    await requireAuth(req, res, next);

    expect(getStatus()).toBe(401);
    expect(getBody()).toEqual({ error: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when auth result is authenticated", async () => {
    const { req, res, next } = fakeExpressArgs({
      result: { authenticated: true, user: { id: "u1", roles: [], metadata: {} } },
    });

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

// ── requireRole ────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("returns 401 when no user is present", async () => {
    const { req, res, next, getStatus } = fakeExpressArgs({
      result: { authenticated: true },
    });

    const guard = requireRole("admin");
    await guard(req, res, next);

    expect(getStatus()).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks the required role", async () => {
    const user: AuthUser = { id: "u1", roles: ["viewer"], metadata: {} };
    const { req, res, next, getStatus, getBody } = fakeExpressArgs({
      result: { authenticated: true, user },
      user,
    });

    const guard = requireRole("admin");
    await guard(req, res, next);

    expect(getStatus()).toBe(403);
    expect(getBody()).toEqual({ error: 'Forbidden: requires role "admin"' });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when user has the required role", async () => {
    const user: AuthUser = { id: "u1", roles: ["admin", "viewer"], metadata: {} };
    const { req, res, next } = fakeExpressArgs({
      result: { authenticated: true, user },
      user,
    });

    const guard = requireRole("admin");
    await guard(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
