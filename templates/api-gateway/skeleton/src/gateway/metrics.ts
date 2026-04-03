import { metrics } from "@opentelemetry/api";

// ── Gateway Metrics ─────────────────────────────────────────────────
//
// OpenTelemetry counters and histograms for gateway traffic. These are
// no-ops unless an OTel SDK is initialized — the API stubs silently
// discard data when no provider is registered. The meter name matches
// the project so dashboards can filter by service.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total proxied requests, labeled by method, route path, upstream, and status. */
export const gatewayProxyTotal = meter.createCounter("gateway_proxy_total", {
  description: "Total number of proxied requests",
});

/** Proxy request duration in milliseconds, labeled by method, route path, upstream, and status. */
export const gatewayProxyDuration = meter.createHistogram(
  "gateway_proxy_duration_ms",
  {
    description: "Proxy request latency in milliseconds",
    unit: "ms",
  },
);

/** Upstream health status gauge (1 = healthy, 0 = unhealthy). */
export const gatewayUpstreamHealth = meter.createUpDownCounter(
  "gateway_upstream_health",
  {
    description: "Upstream health status (1 = healthy, 0 = unhealthy)",
  },
);
