// ── Route Guards ─────────────────────────────────────────────────────
//
// Guard functions that enforce authentication and authorization on
// specific routes. Use these after the auth middleware has run to
// protect endpoints that require authentication or specific roles.

import {
  AUTH_USER_KEY,
  AUTH_RESULT_KEY,
  type AuthenticatedRequest,
} from "./middleware.js";
import type { AuthResult, AuthUser } from "./types.js";

/**
 * Generic middleware handler type for guards.
 */
export type GuardHandler = (...args: unknown[]) => unknown | Promise<unknown>;

/**
 * Guard that rejects unauthenticated requests with a 401 response.
 *
 * Must be used after `createAuthMiddleware` — the auth middleware
 * attaches the auth result, and this guard enforces it.
 *
 * @example
 * ```ts
 * // Hono
 * app.use("/api/*", createAuthMiddleware({ provider: "jwt" }));
 * app.get("/api/profile", requireAuth, (c) => { ... });
 *
 * // Express
 * app.use("/api", createAuthMiddleware({ provider: "jwt" }));
 * app.get("/api/profile", requireAuth, (req, res) => { ... });
 * ```
 */
export const requireAuth: GuardHandler = async (
  ...args: unknown[]
): Promise<unknown> => {
  const firstArg = args[0] as Record<string, unknown>;

  // ── Hono ─────────────────────────────────────────────────────────
  if (firstArg && typeof firstArg.req === "object" && typeof firstArg.json === "function") {
    const c = firstArg as {
      req: { raw: unknown };
      json: (body: unknown, status: number) => unknown;
      get: (key: string) => unknown;
    };
    const next = args[1] as () => Promise<void>;

    const raw = c.req.raw as AuthenticatedRequest;
    const result = raw[AUTH_RESULT_KEY] as AuthResult | undefined;

    if (!result?.authenticated) {
      return c.json(
        { error: result?.error ?? "Authentication required" },
        401,
      );
    }

    return next();
  }

  // ── Express ──────────────────────────────────────────────────────
  if (firstArg && typeof firstArg.headers === "object" && typeof args[2] === "function") {
    const req = firstArg as AuthenticatedRequest & Record<string, unknown>;
    const res = args[1] as {
      status: (code: number) => { json: (body: unknown) => void };
    };
    const next = args[2] as (err?: unknown) => void;

    const result = req[AUTH_RESULT_KEY] as AuthResult | undefined;

    if (!result?.authenticated) {
      res.status(401).json({ error: result?.error ?? "Authentication required" });
      return;
    }

    next();
    return;
  }

  throw new Error("requireAuth: could not detect framework");
};

/**
 * Create a guard that rejects requests from users without the
 * specified role. Returns a 403 response if the authenticated user
 * does not have the required role.
 *
 * Must be used after both `createAuthMiddleware` and `requireAuth`.
 *
 * @param role - The role name to require
 *
 * @example
 * ```ts
 * // Hono
 * app.get("/admin", requireAuth, requireRole("admin"), (c) => { ... });
 *
 * // Express
 * app.get("/admin", requireAuth, requireRole("admin"), (req, res) => { ... });
 * ```
 */
export function requireRole(role: string): GuardHandler {
  return async (...args: unknown[]): Promise<unknown> => {
    const firstArg = args[0] as Record<string, unknown>;

    // ── Hono ───────────────────────────────────────────────────────
    if (firstArg && typeof firstArg.req === "object" && typeof firstArg.json === "function") {
      const c = firstArg as {
        req: { raw: unknown };
        json: (body: unknown, status: number) => unknown;
        get: (key: string) => unknown;
      };
      const next = args[1] as () => Promise<void>;

      const raw = c.req.raw as AuthenticatedRequest;
      const user = raw[AUTH_USER_KEY] as AuthUser | undefined;

      if (!user) {
        return c.json({ error: "Authentication required" }, 401);
      }

      if (!user.roles.includes(role)) {
        return c.json(
          { error: `Forbidden: requires role "${role}"` },
          403,
        );
      }

      return next();
    }

    // ── Express ────────────────────────────────────────────────────
    if (firstArg && typeof firstArg.headers === "object" && typeof args[2] === "function") {
      const req = firstArg as AuthenticatedRequest & Record<string, unknown>;
      const res = args[1] as {
        status: (code: number) => { json: (body: unknown) => void };
      };
      const next = args[2] as (err?: unknown) => void;

      const user = req[AUTH_USER_KEY] as AuthUser | undefined;

      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (!user.roles.includes(role)) {
        res.status(403).json({ error: `Forbidden: requires role "${role}"` });
        return;
      }

      next();
      return;
    }

    throw new Error("requireRole: could not detect framework");
  };
}
