import { billingUsageRecorded } from "../metrics.js";
import { logger } from "../logger.js";
import type { UsageRecord, BillingPeriod } from "../types.js";
import type { RecordOptions, UsageTracker, UsageTrackerConfig } from "./types.js";

// ── Usage Tracker ──────────────────────────────────────────────────
//
// Records usage events in memory with per-customer indexing. Each
// event captures a customer ID, metric name, quantity, timestamp,
// and arbitrary tags. Records are stored in insertion order and
// queryable by customer, period, and tags.
//
// All state is instance-scoped — no module-level mutable state.
//

/**
 * Create a usage tracker that records and retrieves usage events.
 *
 *   const tracker = createUsageTracker();
 *
 *   const record = tracker.record({
 *     customerId: "cus-1",
 *     metric: "api_calls",
 *     quantity: 42,
 *     tags: { endpoint: "/v1/chat" },
 *   });
 */
export function createUsageTracker(config: UsageTrackerConfig = {}): UsageTracker {
  const records: UsageRecord[] = [];
  const idGen = config.idGenerator ?? (() => crypto.randomUUID());

  return {
    record(opts: RecordOptions): UsageRecord {
      if (opts.quantity <= 0) {
        throw new Error("Usage quantity must be a positive number");
      }

      const record: UsageRecord = {
        id: idGen(),
        customerId: opts.customerId,
        metric: opts.metric,
        quantity: opts.quantity,
        timestamp: new Date().toISOString(),
        tags: opts.tags ?? {},
      };

      records.push(record);

      billingUsageRecorded.add(opts.quantity, { metric: opts.metric });
      logger.debug("Usage recorded", {
        customerId: opts.customerId,
        metric: opts.metric,
        quantity: opts.quantity,
      });

      return record;
    },

    getRecords(customerId: string, period: BillingPeriod): UsageRecord[] {
      const start = new Date(period.start).getTime();
      const end = new Date(period.end).getTime();

      return records.filter((r) => {
        if (r.customerId !== customerId) return false;
        const ts = new Date(r.timestamp).getTime();
        return ts >= start && ts <= end;
      });
    },

    getRecordsByTags(
      customerId: string,
      tags: Record<string, string>,
    ): UsageRecord[] {
      return records.filter((r) => {
        if (r.customerId !== customerId) return false;
        return Object.entries(tags).every(
          ([key, value]) => r.tags[key] === value,
        );
      });
    },

    clear(): void {
      records.length = 0;
    },
  };
}
