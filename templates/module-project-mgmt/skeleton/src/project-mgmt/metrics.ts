import { metrics } from "@opentelemetry/api";

// ── Project Management Metrics ────────────────────────────────────
//
// OTel counters and histograms for project management observability.
// Tracks request totals and latency per provider and operation.
// No-ops unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter(process.env.npm_package_name ?? "__PROJECT_NAME__");

/** Total project management requests, labeled by provider and operation. */
export const projectMgmtRequestTotal = meter.createCounter(
  "project_mgmt_request_total",
  {
    description: "Total project management requests by provider and operation",
  },
);

/** Project management request duration in milliseconds, labeled by provider and operation. */
export const projectMgmtDurationMs = meter.createHistogram(
  "project_mgmt_duration_ms",
  {
    description: "Project management request latency in milliseconds",
    unit: "ms",
  },
);
