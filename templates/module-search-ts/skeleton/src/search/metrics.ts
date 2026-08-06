import { metrics } from "@opentelemetry/api";

// ── Search Metrics ───────────────────────────────────────────────
//
// OTel counters and histograms for search observability. Tracks
// request totals, latency, and index counts. No-ops unless an
// OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter(process.env.npm_package_name ?? "__PROJECT_NAME__");

/** Total search requests, labeled by provider and index. */
export const searchRequestTotal = meter.createCounter("search_request_total", {
  description: "Total search requests by provider and index",
});

/** Search request duration in seconds, labeled by provider. */
export const searchDuration = meter.createHistogram("search_duration_seconds", {
  description: "Search request latency in seconds",
  unit: "s",
});

/** Total index operations (create, delete), labeled by operation. */
export const searchIndexTotal = meter.createCounter("search_index_total", {
  description: "Total search index operations by type",
});
