// -- __PROJECT_NAME__ ────────────────────────────────────────────────
//
// __DESCRIPTION__
//
// Main entry point. Re-exports the storage client factory and all
// public types needed by consumers.
//

export { createStorageClient, StorageClient } from "./client.js";
export type {
  StorageProvider,
  StorageObject,
  UploadOptions,
  UploadData,
  ListOptions,
  ListResult,
} from "./types.js";
export type { ProviderConfig } from "./providers/types.js";
export {
  registerProvider,
  getProvider,
  listProviders,
} from "./providers/registry.js";
export { toBuffer, withRetry } from "./providers/helpers.js";
