import { metrics } from "@opentelemetry/api";

// ── Cache Metrics ──────────────────────────────────────────────────
//
// OTel counters and histograms for cache observability. Tracks hit/miss
// rates on get and getOrSet, plus latency for every cache operation.
// No-ops unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total cache get operations, labeled by result (hit or miss). */
export const cacheGetTotal = meter.createCounter("cache_get_total", {
  description: "Total cache get operations by result",
});

/** Cache operation duration in milliseconds, labeled by operation name. */
export const cacheOperationDuration = meter.createHistogram(
  "cache_operation_duration_ms",
  {
    description: "Cache operation latency in milliseconds",
    unit: "ms",
  },
);
