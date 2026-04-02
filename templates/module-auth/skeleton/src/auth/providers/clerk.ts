// ── Clerk Provider ───────────────────────────────────────────────────
//
// Verifies requests using Clerk's backend SDK. Clerk manages the full
// auth lifecycle (sign-up, sign-in, sessions) — this provider validates
// the session token attached to incoming requests.
//
// Environment variables:
//   CLERK_SECRET_KEY — Clerk secret key from the dashboard

import { createClerkClient } from "@clerk/backend";
import type { AuthResult } from "../types.js";
import type { AuthProvider, AuthRequest } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// Circuit breaker for Clerk API calls (user lookup, token verification)
const clerkCb = createCircuitBreaker();

// Lazy singleton for Clerk client — avoids re-creating the client on every
// request while still deferring construction until the secret key is available.
let clerkInstance: ReturnType<typeof createClerkClient> | null = null;
function getClerk(secretKey: string): ReturnType<typeof createClerkClient> {
  if (!clerkInstance) clerkInstance = createClerkClient({ secretKey });
  return clerkInstance;
}

/**
 * Extract the raw Authorization header value.
 */
function getAuthHeader(request: AuthRequest): string | undefined {
  const value =
    typeof request.headers.get === "function"
      ? request.headers.get("authorization")
      : (request.headers["authorization"] as string | undefined);
  return value ?? undefined;
}

// ── User Cache ─────────────────────────────────────────────────────
// TTL cache for Clerk user objects to avoid a users.getUser() API call
// on every request. Entries expire after USER_CACHE_TTL_MS (60 seconds).
// A max-size cap prevents unbounded memory growth.

const USER_CACHE_TTL_MS = 60 * 1000;
const USER_CACHE_MAX_SIZE = 1000;

interface CachedUser {
  data: {
    id: string;
    email: string | undefined;
    name: string | undefined;
    roles: string[];
  };
  cachedAt: number;
}

const userCache = new Map<string, CachedUser>();

function getCachedUser(userId: string): CachedUser["data"] | null {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt >= USER_CACHE_TTL_MS) {
    userCache.delete(userId);
    return null;
  }
  // Move to end of Map iteration order so eviction is true LRU
  userCache.delete(userId);
  userCache.set(userId, entry);
  return entry.data;
}

function setCachedUser(userId: string, data: CachedUser["data"]): void {
  // Evict oldest entries when cache exceeds max size
  if (userCache.size >= USER_CACHE_MAX_SIZE) {
    const firstKey = userCache.keys().next().value as string;
    userCache.delete(firstKey);
  }
  userCache.set(userId, { data, cachedAt: Date.now() });
}

/** Clear the user cache (useful for testing or forced refresh). */
export function clearUserCache(): void {
  userCache.clear();
}

const clerkProvider: AuthProvider = {
  name: "clerk",

  async verifyRequest(request: AuthRequest): Promise<AuthResult> {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      return {
        authenticated: false,
        error: "Clerk provider not configured: set CLERK_SECRET_KEY",
      };
    }

    const authHeader = getAuthHeader(request);
    if (!authHeader) {
      return { authenticated: false, error: "Missing Authorization header" };
    }

    try {
      const clerk = getClerk(secretKey);

      // Authenticate the request using Clerk's backend verification.
      // The token is extracted from the Authorization header.
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const verifiedToken = await clerkCb.execute(() =>
        clerk.verifyToken(token)
      );

      // Resolve user details — check cache first to avoid redundant API calls
      const userId = verifiedToken.sub;
      let userData = getCachedUser(userId);

      if (!userData) {
        // Wrap the Clerk user lookup in the circuit breaker so that
        // repeated Clerk API failures trip the breaker and fast-fail.
        const user = await clerkCb.execute(() =>
          clerk.users.getUser(userId)
        );
        userData = {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
          roles: (user.publicMetadata?.roles as string[]) ?? [],
        };
        setCachedUser(userId, userData);
      }

      return {
        authenticated: true,
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          roles: userData.roles,
          metadata: {
            clerkUserId: userData.id,
            sessionClaims: verifiedToken,
          },
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Clerk verification failed";
      return { authenticated: false, error: message };
    }
  },
};

// Self-register
registerProvider(clerkProvider);

export { clerkProvider };
