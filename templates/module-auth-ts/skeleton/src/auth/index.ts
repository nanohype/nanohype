// ── Auth Module ──────────────────────────────────────────────────────
//
// Main entry point for the __PROJECT_NAME__ auth module.
//
// Default provider: __AUTH_PROVIDER__
//
// Usage:
//   import { createAuthMiddleware, requireAuth, requireRole } from "__PROJECT_NAME__";
//
// All built-in providers (jwt, clerk, auth0, supabase, apikey) are
// registered at import time. To add a custom provider, import
// `registerProvider` from the providers sub-module and register your
// own AuthProvider implementation.

import { validateBootstrap } from "./bootstrap.js";

validateBootstrap();

// Re-export guards
export { requireAuth, requireRole } from "./guards.js";

// Re-export middleware factory and helpers
export {
  AUTH_RESULT_KEY,
  AUTH_USER_KEY,
  createAuthMiddleware,
  getAuthResult,
  getAuthUser,
} from "./middleware.js";
// Re-export provider utilities for custom provider registration
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { AuthProvider, AuthRequest } from "./providers/types.js";
// Re-export core types
export type { AuthConfig, AuthResult, AuthUser } from "./types.js";
