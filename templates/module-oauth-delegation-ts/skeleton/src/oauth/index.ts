// ── Public API ───────────────────────────────────────────────────────
//
// Everything importable from the package root. Provider and storage
// modules are also re-exported via the `/providers` and `/storage`
// subpath exports in package.json.

export {
  ConfigError,
  MissingCredentialsError,
  OAuthError,
  ProviderError,
  RedirectMismatchError,
  RefreshFailedError,
  StateExpiredError,
  StateMissingError,
  StateTamperedError,
  UnauthenticatedError,
  UnknownProviderError,
  UserMismatchError,
} from "./errors.js";
export { logger } from "./logger.js";
// Provider adapters — importing this file also triggers their self-registration
// via the ./providers barrel.
export {
  atlassianProvider,
  getProvider,
  googleProvider,
  hubspotProvider,
  listProviders,
  notionProvider,
  registerProvider,
  slackProvider,
} from "./providers/index.js";
export type { CreateOAuthRouterDeps } from "./router.js";
export { createOAuthRouter } from "./router.js";
export type { StatePayload } from "./state.js";
// State cookie helpers — `readStatePayloadUnverified` lets consumers peek
// at the userId / provider / returnTo without verifying the HMAC, which
// is useful when routing `resolveUserId` signals on `/callback` from a
// service that has no independent auth source. See its JSDoc for the
// (narrow) safety contract.
export { readStatePayloadUnverified } from "./state.js";
export type { DDBKmsTokenStorageConfig } from "./storage/ddb-kms.js";
export { DDBKmsTokenStorage } from "./storage/ddb-kms.js";
// Storage backends.
export { InMemoryTokenStorage } from "./storage/memory.js";
export type {
  ClientCredentials,
  OAuthProvider,
  OAuthRouter,
  OAuthRouterConfig,
  RequestHandler,
  ResolveUserId,
  RevocationEmitter,
  RevocationReason,
  TokenGrant,
  TokenStorage,
} from "./types.js";
