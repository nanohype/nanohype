// ── Filter Registry ──────────────────────────────────────────────────
//
// Central registry that maps filter names to filter instances.
// Filters self-register at import time by calling `registerFilter`.
// The pipeline looks up filters here by name.

import type { Filter } from "./types.js";

const filters = new Map<string, Filter>();

/**
 * Register a safety filter. Called by each filter module at import
 * time. If a filter with the same name is already registered, the
 * new one replaces it (useful for testing or overrides).
 */
export function registerFilter(filter: Filter): void {
  filters.set(filter.name, filter);
}

/**
 * Retrieve a registered filter by name.
 * Returns undefined if no filter with that name has been registered.
 */
export function getFilter(name: string): Filter | undefined {
  return filters.get(name);
}

/**
 * List all registered filter names. Useful for diagnostics and
 * error messages that suggest valid filter names.
 */
export function listFilters(): string[] {
  return Array.from(filters.keys());
}
