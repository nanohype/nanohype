// ── Provider Barrel ─────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by calling
// registerProvider() after this import.
//

import "./notion.js";
import "./confluence.js";
import "./google-docs.js";
import "./coda.js";
import "./mock.js";

export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { KnowledgeProvider, KnowledgeProviderFactory } from "./types.js";
