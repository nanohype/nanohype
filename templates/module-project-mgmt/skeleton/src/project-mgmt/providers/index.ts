// ── Provider Barrel ─────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by calling
// registerProvider() after this import.
//

import "./linear.js";
import "./jira.js";
import "./asana.js";
import "./shortcut.js";
import "./mock.js";

export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { ProjectProvider, ProjectProviderFactory } from "./types.js";
