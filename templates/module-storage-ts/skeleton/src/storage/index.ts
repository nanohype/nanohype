// -- __PROJECT_NAME__ ────────────────────────────────────────────────
//
// __DESCRIPTION__
//
// Main entry point. Re-exports the storage client factory and all
// public types needed by consumers.
//

export { createStorageClient, StorageClient } from "./client.js";
export { toBuffer, withRetry } from "./providers/helpers.js";
export {
  getProvider,
  listProviders,
  registerProvider,
} from "./providers/registry.js";
export type { ProviderConfig } from "./providers/types.js";
export type {
  ListOptions,
  ListResult,
  StorageObject,
  StorageProvider,
  UploadData,
  UploadOptions,
} from "./types.js";
