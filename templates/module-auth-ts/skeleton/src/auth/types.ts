// ── Core Auth Types ──────────────────────────────────────────────────
//
// Shared type definitions for the auth module. All providers and
// middleware reference these types.

/**
 * Authenticated user identity attached to the request context after
 * successful verification. Providers map their own user models onto
 * this common shape.
 */
export interface AuthUser {
  /** Unique identifier from the auth provider (sub claim, user id, etc.) */
  id: string;

  /** User's email address, if available from the provider */
  email?: string;

  /** Display name, if available */
  name?: string;

  /** Roles assigned to the user, used by route guards */
  roles: string[];

  /** Provider-specific metadata that doesn't map to standard fields */
  metadata: Record<string, unknown>;
}

/**
 * Result returned by every provider's `verifyRequest` method.
 */
export interface AuthResult {
  /** Whether the request was successfully authenticated */
  authenticated: boolean;

  /** The resolved user identity, present only when authenticated is true */
  user?: AuthUser;

  /** Human-readable error description when authentication fails */
  error?: string;
}

/**
 * Configuration passed to `createAuthMiddleware`. The provider name
 * selects a registered provider from the registry.
 */
export interface AuthConfig {
  /** Name of the registered auth provider to use (e.g. "jwt", "clerk") */
  provider: string;

  /** Provider-specific options forwarded to the provider instance */
  options?: Record<string, unknown>;
}
