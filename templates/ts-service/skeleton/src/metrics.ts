import { metrics } from "@opentelemetry/api";

// ── Application Metrics ────────────────────────────────────────────
//
// Lightweight counters and histograms using the OTel metrics API.
// These are no-ops unless an OTel SDK is wired in by the consumer
// (e.g. @opentelemetry/sdk-node with an OTLP exporter). The meter
// name matches the project so dashboards can filter by service.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total HTTP requests, labeled by method, path, and status code. */
export const httpRequestTotal = meter.createCounter("http_request_total", {
  description: "Total number of HTTP requests received",
});

/** HTTP request duration in milliseconds, labeled by method, path, and status. */
export const httpRequestDuration = meter.createHistogram(
  "http_request_duration_ms",
  {
    description: "HTTP request latency in milliseconds",
    unit: "ms",
  },
);
