import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

// ── Auth Configuration ──────────────────────────────────────────────
//
// NextAuth.js v5 configuration. Add providers (GitHub, Google, Credentials, etc.)
// to the providers array below. See: https://authjs.dev/getting-started/providers
//
// Environment variables:
//   AUTH_SECRET  — Required. Generate with: npx auth secret
//   AUTH_URL     — Required in production. Your app's canonical URL.
//

const config: NextAuthConfig = {
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

export const { handlers, auth, signIn, signOut } = NextAuth(config);
