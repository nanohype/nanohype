// Re-export the OAuthProvider interface so providers can import from a
// local path that doesn't reach up into the oauth root.
export type { OAuthProvider, TokenGrant } from "../types.js";
