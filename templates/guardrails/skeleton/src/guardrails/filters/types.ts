// ── Filter Interface ─────────────────────────────────────────────────
//
// Every safety filter implements this interface. The pipeline calls
// `filter` with the content and direction, then aggregates results.

import type { Direction, FilterResult } from "../types.js";

/**
 * Contract that all safety filters must implement. Each filter is
 * responsible for inspecting content and returning a result that
 * indicates whether the content is allowed, optionally redacting
 * sensitive portions, and listing any violations found.
 */
export interface Filter {
  /** Unique name used to look up this filter in the registry */
  readonly name: string;

  /**
   * Inspect and optionally transform the content.
   *
   * Must never throw — detection failures are expressed through
   * the result's `allowed` and `violations` fields.
   */
  filter(input: string, direction: Direction): FilterResult;
}
