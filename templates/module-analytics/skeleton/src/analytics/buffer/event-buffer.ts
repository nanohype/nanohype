// ── Event Buffer ──────────────────────────────────────────────────
//
// Instance-scoped event buffer that accumulates events in memory
// and flushes them to a callback on interval or at capacity.
//
// Each call to createEventBuffer() returns an independent buffer --
// no module-level mutable state. The setInterval for periodic flush
// is cleared on close().
//

import { logger } from "../logger.js";

export interface EventBufferOptions {
  /** Maximum number of events before auto-flush. Default: 100. */
  maxSize?: number;

  /** Flush interval in milliseconds. Default: 10000 (10s). */
  flushIntervalMs?: number;

  /** Callback invoked with the batch of events on flush. */
  onFlush: (events: Record<string, unknown>[]) => Promise<void>;
}

export interface EventBuffer {
  /** Add an event to the buffer. Triggers flush if capacity is reached. */
  add(event: Record<string, unknown>): void;

  /** Manually flush all buffered events. */
  flush(): Promise<void>;

  /** Flush remaining events and stop the periodic timer. */
  close(): Promise<void>;

  /** Current number of buffered events. */
  readonly size: number;
}

/**
 * Create an instance-scoped event buffer.
 *
 * Events are accumulated in memory and flushed either when the buffer
 * reaches `maxSize` or on a periodic `flushIntervalMs` timer,
 * whichever comes first.
 *
 * ```typescript
 * const buffer = createEventBuffer({
 *   maxSize: 50,
 *   flushIntervalMs: 5000,
 *   onFlush: async (events) => {
 *     await sendToApi(events);
 *   },
 * });
 *
 * buffer.add({ event: "click", userId: "123" });
 * await buffer.close(); // flushes remaining and stops timer
 * ```
 */
export function createEventBuffer(opts: EventBufferOptions): EventBuffer {
  const maxSize = opts.maxSize ?? 100;
  const flushIntervalMs = opts.flushIntervalMs ?? 10_000;
  const onFlush = opts.onFlush;

  let events: Record<string, unknown>[] = [];
  let flushing = false;

  const timer = setInterval(() => {
    if (events.length > 0 && !flushing) {
      flush().catch((err) => {
        logger.error("periodic flush failed", { error: String(err) });
      });
    }
  }, flushIntervalMs);

  // Prevent the timer from keeping the process alive
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  async function flush(): Promise<void> {
    if (events.length === 0 || flushing) return;

    flushing = true;
    const batch = events;
    events = [];

    try {
      await onFlush(batch);
    } catch (err) {
      // Re-queue failed events at the front
      events = [...batch, ...events];
      throw err;
    } finally {
      flushing = false;
    }
  }

  function add(event: Record<string, unknown>): void {
    events.push(event);

    if (events.length >= maxSize && !flushing) {
      flush().catch((err) => {
        logger.error("capacity flush failed", { error: String(err) });
      });
    }
  }

  async function close(): Promise<void> {
    clearInterval(timer);
    await flush();
  }

  return {
    add,
    flush,
    close,
    get size() {
      return events.length;
    },
  };
}
