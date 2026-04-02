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
      const clerk = createClerkClient({ secretKey });

      // Authenticate the request using Clerk's backend verification.
      // The token is extracted from the Authorization header.
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const verifiedToken = await clerk.verifyToken(token);

      // Resolve user details from Clerk
      const user = await clerk.users.getUser(verifiedToken.sub);

      return {
        authenticated: true,
        user: {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
          roles: (user.publicMetadata?.roles as string[]) ?? [],
          metadata: {
            clerkUserId: user.id,
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
