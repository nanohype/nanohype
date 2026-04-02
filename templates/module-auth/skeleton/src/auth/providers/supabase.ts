// ── Supabase Provider ────────────────────────────────────────────────
//
// Verifies Supabase Auth JWTs. Uses the Supabase client SDK to validate
// the access token and retrieve the authenticated user.
//
// Environment variables:
//   SUPABASE_URL     — Supabase project URL
//   SUPABASE_ANON_KEY — Supabase anon/public key (used to init the client)

import { createClient } from "@supabase/supabase-js";
import type { AuthResult } from "../types.js";
import type { AuthProvider, AuthRequest } from "./types.js";
import { registerProvider } from "./registry.js";

/**
 * Extract a Bearer token from the Authorization header.
 */
function extractBearerToken(request: AuthRequest): string | null {
  const header =
    typeof request.headers.get === "function"
      ? request.headers.get("authorization")
      : (request.headers["authorization"] as string | undefined);

  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

const supabaseProvider: AuthProvider = {
  name: "supabase",

  async verifyRequest(request: AuthRequest): Promise<AuthResult> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return {
        authenticated: false,
        error:
          "Supabase provider not configured: set SUPABASE_URL and SUPABASE_ANON_KEY",
      };
    }

    const token = extractBearerToken(request);
    if (!token) {
      return { authenticated: false, error: "Missing Bearer token" };
    }

    try {
      const supabase = createClient(supabaseUrl, anonKey);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return {
          authenticated: false,
          error: error?.message ?? "Invalid Supabase token",
        };
      }

      return {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name as string | undefined,
          roles: (user.app_metadata?.roles as string[]) ?? [],
          metadata: {
            supabaseUserId: user.id,
            userMetadata: user.user_metadata,
            appMetadata: user.app_metadata,
          },
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Supabase verification failed";
      return { authenticated: false, error: message };
    }
  },
};

// Self-register
registerProvider(supabaseProvider);

export { supabaseProvider };
