// ── Cost Calculator ─────────────────────────────────────────────────
//
// Records per-span cost entries and provides query capabilities for
// cost analysis. All state is instance-scoped via the factory
// function — no module-level mutable state.
//

import type { LlmSpan, CostEntry } from "../types.js";
import type { CostFilters, CostSummary } from "./types.js";
import { calculateCost } from "./pricing.js";

/**
 * Create a cost calculator instance. Entries are stored in memory
 * with tag-based filtering for breakdowns by model, provider, or
 * any custom dimension.
 */
export function createCostCalculator() {
  const entries: CostEntry[] = [];

  /**
   * Record a cost entry from a captured LLM span.
   * Calculates cost from the pricing table and returns the entry.
   */
  function record(span: LlmSpan): CostEntry {
    const cost = calculateCost(span.model, span.inputTokens, span.outputTokens);

    const entry: CostEntry = {
      timestamp: span.endedAt,
      provider: span.provider,
      model: span.model,
      inputTokens: span.inputTokens,
      outputTokens: span.outputTokens,
      cost,
      durationMs: span.durationMs,
      tags: span.tags,
    };

    entries.push(entry);
    return entry;
  }

  /**
   * Query cost entries with optional filters and return an aggregated summary.
   */
  function query(filters: CostFilters = {}): CostSummary {
    let filtered = entries;

    if (filters.provider) {
      filtered = filtered.filter((e) => e.provider === filters.provider);
    }
    if (filters.model) {
      filtered = filtered.filter((e) => e.model === filters.model);
    }
    if (filters.tags) {
      const requiredTags = filters.tags;
      filtered = filtered.filter((e) =>
        Object.entries(requiredTags).every(([k, v]) => e.tags[k] === v),
      );
    }
    if (filters.since) {
      const since = new Date(filters.since).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= since);
    }
    if (filters.until) {
      const until = new Date(filters.until).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= until);
    }

    const totalCost = filtered.reduce((sum, e) => sum + e.cost, 0);
    const byModel: Record<string, number> = {};
    const byProvider: Record<string, number> = {};

    for (const entry of filtered) {
      byModel[entry.model] = (byModel[entry.model] ?? 0) + entry.cost;
      byProvider[entry.provider] = (byProvider[entry.provider] ?? 0) + entry.cost;
    }

    return {
      totalCost,
      totalRequests: filtered.length,
      byModel,
      byProvider,
      entries: filtered,
    };
  }

  /**
   * Get all recorded entries (unfiltered).
   */
  function getEntries(): CostEntry[] {
    return [...entries];
  }

  return { record, query, getEntries };
}

export type CostCalculator = ReturnType<typeof createCostCalculator>;
