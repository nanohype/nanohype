import { metrics } from "@opentelemetry/api";

// ── Semantic Cache Metrics ─────────────────────────────────────────
//
// OTel counters and histograms for semantic cache observability.
// Tracks lookup hit/miss rates, store operations, and embedding
// latency. No-ops unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total semantic cache lookup operations, labeled by result (hit or miss). */
export const cacheLookupTotal = meter.createCounter("semantic_cache_lookup_total", {
  description: "Total semantic cache lookup operations by result",
});

/** Semantic cache operation duration in seconds, labeled by operation name. */
export const cacheOperationDuration = meter.createHistogram(
  "semantic_cache_operation_duration_seconds",
  {
    description: "Semantic cache operation latency in seconds",
    unit: "s",
  },
);

/** Embedding generation duration in seconds. */
export const embeddingDuration = meter.createHistogram(
  "semantic_cache_embedding_duration_seconds",
  {
    description: "Embedding generation latency in seconds",
    unit: "s",
  },
);
