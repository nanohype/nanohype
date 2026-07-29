// ── Providers barrel ─────────────────────────────────────────────────
//
// Side-effect imports register the built-in providers; named re-exports
// let consumers pass the adapter objects directly to `createOAuthRouter`
// without going through the registry.

import "./notion.js";
import "./google.js";
import "./atlassian.js";
import "./slack.js";
import "./hubspot.js";

export { atlassianProvider } from "./atlassian.js";
export { googleProvider } from "./google.js";
export { hubspotProvider } from "./hubspot.js";
export { notionProvider } from "./notion.js";
export type { OAuthProviderFactory } from "./registry.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export { slackProvider } from "./slack.js";
export type { OAuthProvider, TokenGrant } from "./types.js";
