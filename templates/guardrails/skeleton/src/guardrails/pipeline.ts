// ── Filter Pipeline ──────────────────────────────────────────────────
//
// Chains multiple filters together, running content through each in
// sequence. Collects all violations and optionally short-circuits on
// the first blocking violation.

import type { Direction, FilterResult, GuardrailConfig, Violation } from "./types.js";
import { getFilter, listFilters } from "./filters/registry.js";
import { logger } from "../logger.js";

/**
 * Create a filter pipeline from the given configuration. Returns a
 * function that runs content through all active filters in sequence.
 *
 * When `shortCircuit` is true (the default), the pipeline stops at the
 * first filter that blocks the content. When false, all filters run
 * and violations are collected from every filter.
 */
export function createPipeline(config: GuardrailConfig = {}) {
  const shortCircuit = config.shortCircuit ?? true;

  // Resolve which filters to run
  const filterNames = config.filters?.length ? config.filters : listFilters();

  return function runPipeline(input: string, direction: Direction): FilterResult {
    let filtered = input;
    const allViolations: Violation[] = [];
    let allowed = true;

    for (const name of filterNames) {
      const filter = getFilter(name);
      if (!filter) {
        logger.warn("Filter not found in registry, skipping", { filter: name });
        continue;
      }

      const result = filter.filter(filtered, direction);
      filtered = result.filtered;
      allViolations.push(...result.violations);

      if (!result.allowed) {
        allowed = false;

        logger.info("Filter blocked content", {
          filter: name,
          direction,
          violationCount: result.violations.length,
        });

        if (shortCircuit) {
          break;
        }
      }
    }

    if (allViolations.length > 0) {
      logger.debug("Pipeline completed with violations", {
        direction,
        totalViolations: allViolations.length,
        filters: filterNames,
      });
    }

    return {
      allowed,
      filtered,
      violations: allViolations,
    };
  };
}
