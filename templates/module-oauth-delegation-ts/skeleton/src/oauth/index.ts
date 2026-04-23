// ── Public API ───────────────────────────────────────────────────────
//
// Everything importable from the package root. Provider and storage
// modules are also re-exported via the `/providers` and `/storage`
// subpath exports in package.json.

export { createOAuthRouter } from "./router.js";
export type { CreateOAuthRouterDeps } from "./router.js";

export type {
  TokenGrant,
  TokenStorage,
  RevocationReason,
  RevocationEmitter,
  OAuthProvider,
  ClientCredentials,
  RequestHandler,
  ResolveUserId,
  OAuthRouterConfig,
  OAuthRouter,
} from "./types.js";

export {
  OAuthError,
  StateTamperedError,
  StateExpiredError,
  StateMissingError,
  UserMismatchError,
  UnauthenticatedError,
  UnknownProviderError,
  MissingCredentialsError,
  RedirectMismatchError,
  RefreshFailedError,
  ProviderError,
  ConfigError,
} from "./errors.js";

export { logger } from "./logger.js";

// State cookie helpers — `readStatePayloadUnverified` lets consumers peek
// at the userId / provider / returnTo without verifying the HMAC, which
// is useful when routing `resolveUserId` signals on `/callback` from a
// service that has no independent auth source. See its JSDoc for the
// (narrow) safety contract.
export { readStatePayloadUnverified } from "./state.js";
export type { StatePayload } from "./state.js";

// Provider adapters — importing this file also triggers their self-registration
// via the ./providers barrel.
export {
  registerProvider,
  getProvider,
  listProviders,
  notionProvider,
  googleProvider,
  atlassianProvider,
  slackProvider,
  hubspotProvider,
} from "./providers/index.js";

// Storage backends.
export { InMemoryTokenStorage } from "./storage/memory.js";
export { DDBKmsTokenStorage } from "./storage/ddb-kms.js";
export type { DDBKmsTokenStorageConfig } from "./storage/ddb-kms.js";
