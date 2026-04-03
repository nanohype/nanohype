import { metrics } from "@opentelemetry/api";

// ── Analytics Metrics ────────────────────────────────────────────
//
// OTel counters and histograms for analytics observability. Tracks
// events tracked, flush totals, and flush duration. No-ops unless
// an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter(process.env.npm_package_name ?? "__PROJECT_NAME__");

/** Total events tracked, labeled by provider and event name. */
export const analyticsEventsTracked = meter.createCounter("analytics_events_tracked", {
  description: "Total analytics events tracked by provider",
});

/** Total flush operations, labeled by provider and result. */
export const analyticsFlushTotal = meter.createCounter("analytics_flush_total", {
  description: "Total analytics flush operations by provider",
});

/** Flush duration in milliseconds, labeled by provider. */
export const analyticsFlushDurationMs = meter.createHistogram("analytics_flush_duration_ms", {
  description: "Analytics flush latency in milliseconds",
  unit: "ms",
});
