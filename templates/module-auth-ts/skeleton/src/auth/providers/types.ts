// ── Provider Interface ───────────────────────────────────────────────
//
// Every auth provider implements this interface. The middleware calls
// `verifyRequest` with the incoming request and uses the result to
// either attach user context or reject the request.

import type { AuthResult } from "../types.js";

/**
 * Minimal request shape that both Hono and Express requests satisfy.
 * Providers only need access to headers for token/key extraction.
 */
export interface AuthRequest {
  headers: {
    get?(name: string): string | null | undefined;
    [key: string]: unknown;
  };
}

/**
 * Contract that all auth providers must implement. Each provider is
 * responsible for extracting credentials from the request and verifying
 * them against its backing service.
 */
export interface AuthProvider {
  /** Unique name used to look up this provider in the registry */
  readonly name: string;

  /**
   * Verify the incoming request and return an AuthResult.
   * Must never throw — authentication failures are expressed through
   * the result's `authenticated` and `error` fields.
   */
  verifyRequest(request: AuthRequest): Promise<AuthResult>;
}
