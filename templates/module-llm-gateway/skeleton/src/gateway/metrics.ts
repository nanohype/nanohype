import { metrics } from "@opentelemetry/api";

// ── Gateway Metrics ─────────────────────────────────────────────────
//
// OTel counters and histograms for LLM gateway observability. Tracks
// request counts, latency, token usage, cost, and cache hit/miss
// rates per provider and model. No-ops unless an OTel SDK is wired
// in by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total gateway chat requests, labeled by provider and model. */
export const gatewayRequestTotal = meter.createCounter("gateway_request_total", {
  description: "Total number of gateway chat requests",
});

/** Gateway request duration in milliseconds, labeled by provider. */
export const gatewayRequestDuration = meter.createHistogram("gateway_request_duration_ms", {
  description: "Gateway chat request latency in milliseconds",
  unit: "ms",
});

/** Token usage counter, labeled by provider and direction (input/output). */
export const gatewayTokenUsage = meter.createCounter("gateway_token_usage", {
  description: "Token usage by provider and direction",
});

/** Cost counter in USD, labeled by provider and model. */
export const gatewayCostTotal = meter.createCounter("gateway_cost_usd", {
  description: "Total cost in USD by provider and model",
});

/** Cache hit/miss counter, labeled by result (hit or miss). */
export const gatewayCacheTotal = meter.createCounter("gateway_cache_total", {
  description: "Gateway cache lookups by result",
});
