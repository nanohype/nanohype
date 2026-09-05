import type { NextAuthConfig } from "next-auth";

// ── Auth Options ────────────────────────────────────────────────────
//
// The NextAuth configuration, separated from the call that builds the
// runtime. `NextAuth(...)` reads the environment and constructs handlers at
// import, so a module that calls it cannot be loaded to inspect one value.
// Keeping the object here leaves the authorization decision reachable on its
// own — the import above is type-only and erases.
//
// Add providers (GitHub, Google, Credentials, etc.) to the providers array.
// See: https://authjs.dev/getting-started/providers
//
// Environment variables:
//   AUTH_SECRET  — Required. Generate with: npx auth secret
//   AUTH_URL     — Required in production. Your app's canonical URL.
//
export const authOptions: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
