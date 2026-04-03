// ── Cost Tracker ────────────────────────────────────────────────────
//
// Records per-request cost entries with attribution tags and provides
// query capabilities for cost analysis. Entries are stored in memory
// with optional tag-based filtering for breakdowns by model, user,
// project, or any custom dimension.
//

import type { GatewayResponse } from "../types.js";

/** A single cost entry for one gateway request. */
export interface CostEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Provider that handled the request. */
  provider: string;
  /** Model used. */
  model: string;
  /** Input tokens consumed. */
  inputTokens: number;
  /** Output tokens generated. */
  outputTokens: number;
  /** Total cost in USD. */
  cost: number;
  /** Request latency in milliseconds. */
  latencyMs: number;
  /** Attribution tags (user, project, etc.). */
  tags: Record<string, string>;
}

/** Filters for querying cost entries. */
export interface CostFilters {
  /** Filter by provider name. */
  provider?: string;
  /** Filter by model name. */
  model?: string;
  /** Filter by tag key-value pairs (all must match). */
  tags?: Record<string, string>;
  /** Start of time range (ISO-8601). */
  since?: string;
  /** End of time range (ISO-8601). */
  until?: string;
}

/** Aggregated cost query result. */
export interface CostSummary {
  /** Total cost in USD across all matching entries. */
  totalCost: number;
  /** Total number of matching entries. */
  totalRequests: number;
  /** Cost breakdown by model. */
  byModel: Record<string, number>;
  /** Cost breakdown by tag value for a given key (e.g., by user). */
  byUser: Record<string, number>;
  /** Cost breakdown by project tag. */
  byProject: Record<string, number>;
  /** The matching entries. */
  entries: CostEntry[];
}

export function createCostTracker() {
  const entries: CostEntry[] = [];

  /**
   * Record a cost entry for a completed request.
   */
  function record(
    response: GatewayResponse,
    tags: Record<string, string> = {},
  ): CostEntry {
    const entry: CostEntry = {
      timestamp: new Date().toISOString(),
      provider: response.provider,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      cost: response.cost,
      latencyMs: response.latencyMs,
      tags,
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
    const byUser: Record<string, number> = {};
    const byProject: Record<string, number> = {};

    for (const entry of filtered) {
      byModel[entry.model] = (byModel[entry.model] ?? 0) + entry.cost;

      const user = entry.tags["user"];
      if (user) {
        byUser[user] = (byUser[user] ?? 0) + entry.cost;
      }

      const project = entry.tags["project"];
      if (project) {
        byProject[project] = (byProject[project] ?? 0) + entry.cost;
      }
    }

    return {
      totalCost,
      totalRequests: filtered.length,
      byModel,
      byUser,
      byProject,
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

export type CostTracker = ReturnType<typeof createCostTracker>;
