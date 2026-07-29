// ── Provider Barrel Export ────────────────────────────────────────────
//
// Importing this module triggers self-registration for all built-in
// providers. The re-exports make individual providers available for
// direct access when needed.

export { apikeyProvider } from "./apikey.js";
export { auth0Provider } from "./auth0.js";
export { clerkProvider } from "./clerk.js";
// Import each provider to trigger self-registration
export { jwtProvider } from "./jwt.js";
export { mockProvider } from "./mock.js";
export { getProvider, listProviders, registerProvider } from "./registry.js";
export { supabaseProvider } from "./supabase.js";
export type { AuthProvider, AuthRequest } from "./types.js";
