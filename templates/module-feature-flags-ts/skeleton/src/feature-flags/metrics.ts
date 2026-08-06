import { metrics } from "@opentelemetry/api";

// ── Feature Flag Metrics ──────────────────────────────────────────
//
// OTel counters and histograms for flag evaluation observability.
// Tracks evaluation counts by flag and variant, plus evaluation
// latency. No-ops unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total flag evaluations, labeled by flag key and resolved variant. */
export const flagEvalTotal = meter.createCounter("flag_eval_total", {
  description: "Total flag evaluations by flag key and variant",
});

/** Flag evaluation duration in seconds. */
export const flagEvalDuration = meter.createHistogram("flag_eval_duration_seconds", {
  description: "Flag evaluation latency in seconds",
  unit: "s",
});

/** Variant tracking records emitted. */
export const variantTrackTotal = meter.createCounter("variant_track_total", {
  description: "Total variant tracking records emitted",
});
