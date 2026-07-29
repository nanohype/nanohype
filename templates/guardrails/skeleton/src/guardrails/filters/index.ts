// ── Filter Barrel Export ─────────────────────────────────────────────
//
// Importing this module triggers self-registration for all built-in
// filters. The re-exports make individual filters available for
// direct access when needed.

export { contentPolicyFilter, getBlockedKeywords, setBlockedKeywords } from "./content-policy.js";
export { piiFilter } from "./pii.js";

// Import each filter to trigger self-registration
export { promptInjectionFilter } from "./prompt-injection.js";
export { getFilter, listFilters, registerFilter } from "./registry.js";
export { estimateTokens, getMaxTokens, setMaxTokens, tokenLimitFilter } from "./token-limit.js";
export type { Filter } from "./types.js";
