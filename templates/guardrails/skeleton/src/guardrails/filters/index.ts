// ── Filter Barrel Export ─────────────────────────────────────────────
//
// Importing this module triggers self-registration for all built-in
// filters. The re-exports make individual filters available for
// direct access when needed.

export { registerFilter, getFilter, listFilters } from "./registry.js";
export type { Filter } from "./types.js";

// Import each filter to trigger self-registration
export { promptInjectionFilter } from "./prompt-injection.js";
export { piiFilter } from "./pii.js";
export { contentPolicyFilter, setBlockedKeywords, getBlockedKeywords } from "./content-policy.js";
export { tokenLimitFilter, setMaxTokens, getMaxTokens, estimateTokens } from "./token-limit.js";
