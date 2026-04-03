// ── Vector Store Barrel ─────────────────────────────────────────────
//
// Importing this module causes all built-in vector store backends to
// self-register with the store registry. Custom backends can be added
// by importing their module after this one.
//

import "./memory.js";

export {
  registerVectorStore,
  getVectorStore,
  listVectorStores,
} from "./registry.js";
export type { VectorCacheStore, VectorStoreConfig } from "./types.js";
