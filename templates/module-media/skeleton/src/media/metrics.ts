import { metrics } from "@opentelemetry/api";

// ── Media Metrics ────────────────────────────────────────────────
//
// OTel counters and histograms for media observability. Tracks
// upload totals, transform totals, and operation duration. No-ops
// unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter(process.env.npm_package_name ?? "__PROJECT_NAME__");

/** Total media upload operations, labeled by provider. */
export const mediaUploadTotal = meter.createCounter("media_upload_total", {
  description: "Total media upload operations by provider",
});

/** Total media transform operations, labeled by provider. */
export const mediaTransformTotal = meter.createCounter("media_transform_total", {
  description: "Total media transform operations by provider",
});

/** Media operation duration in milliseconds, labeled by operation. */
export const mediaDurationMs = meter.createHistogram("media_duration_ms", {
  description: "Media operation latency in milliseconds",
  unit: "ms",
});
