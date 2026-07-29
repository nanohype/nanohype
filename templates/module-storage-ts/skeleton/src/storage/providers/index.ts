// -- Provider Barrel Import ----------------------------------------------
//
// Importing this module loads all built-in providers, triggering their
// self-registration with the provider registry. Custom providers can
// be added by importing them separately after this barrel.
//

import "./local.js";
import "./s3.js";
import "./r2.js";

export { toBuffer, withRetry } from "./helpers.js";
export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { ProviderConfig, StorageProvider } from "./types.js";
