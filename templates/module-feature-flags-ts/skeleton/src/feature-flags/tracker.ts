// ── Variant Tracker ─────────────────────────────────────────────────
//
// Records flag evaluation outcomes for observability and analytics.
// Each record captures the flag key, variant, user ID, and optional
// metadata. Records are buffered in memory and flushed via a
// configurable callback (e.g., send to a telemetry pipeline, write
// to a database, emit as structured logs).
//
// Factory function returns a fresh tracker instance — no module-level
// mutable state.
//

import { variantTrackTotal } from "./metrics.js";

/** A single variant tracking record. */
export interface TrackingRecord {
  /** The flag key that was evaluated. */
  flagKey: string;

  /** The resolved variant name. */
  variant: string;

  /** The user ID from the targeting context, if available. */
  userId?: string;

  /** Arbitrary metadata (e.g., experiment ID, session ID). */
  metadata?: Record<string, unknown>;

  /** ISO-8601 timestamp of when the evaluation occurred. */
  timestamp: string;
}

/** Callback for flushing buffered records. */
export type FlushCallback = (records: TrackingRecord[]) => Promise<void>;

export interface VariantTrackerConfig {
  /** Maximum records to buffer before auto-flushing. Default: 100. */
  bufferSize?: number;

  /** Callback invoked when the buffer is flushed. */
  onFlush?: FlushCallback;
}

export interface VariantTracker {
  /** Record a flag evaluation outcome. */
  record(
    flagKey: string,
    variant: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): void;

  /** Flush all buffered records immediately. */
  flush(): Promise<void>;

  /** Return the current number of buffered records. */
  pending(): number;

  /** Shut down the tracker, flushing remaining records. */
  close(): Promise<void>;
}

/**
 * Create a new variant tracker instance.
 *
 * Each call returns an independent tracker with its own buffer.
 * No module-level mutable state is shared between instances.
 */
export function createVariantTracker(config: VariantTrackerConfig = {}): VariantTracker {
  const bufferSize = config.bufferSize ?? 100;
  const onFlush = config.onFlush;
  let buffer: TrackingRecord[] = [];

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;

    const records = buffer;
    buffer = [];

    if (onFlush) {
      await onFlush(records);
    }
  }

  return {
    record(
      flagKey: string,
      variant: string,
      userId?: string,
      metadata?: Record<string, unknown>,
    ): void {
      const record: TrackingRecord = {
        flagKey,
        variant,
        userId,
        metadata,
        timestamp: new Date().toISOString(),
      };

      buffer.push(record);
      variantTrackTotal.add(1, { flagKey, variant });

      if (buffer.length >= bufferSize) {
        // Fire-and-forget auto-flush — errors are swallowed to avoid
        // blocking the caller. The onFlush callback should handle its
        // own error reporting.
        void flush().catch(() => {});
      }
    },

    flush,

    pending(): number {
      return buffer.length;
    },

    async close(): Promise<void> {
      await flush();
    },
  };
}
