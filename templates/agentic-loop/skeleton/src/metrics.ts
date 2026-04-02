import { metrics } from "@opentelemetry/api";

// ── Agent Metrics ──────────────────────────────────────────────────
//
// OTel counters and histograms for LLM call observability. Tracks
// request counts, latency, and token usage per provider/model.
// No-ops unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total LLM requests, labeled by provider and model. */
export const llmRequestTotal = meter.createCounter("llm_request_total", {
  description: "Total number of LLM API requests",
});

/** LLM request duration in milliseconds, labeled by provider. */
export const llmRequestDuration = meter.createHistogram(
  "llm_request_duration_ms",
  {
    description: "LLM API request latency in milliseconds",
    unit: "ms",
  },
);

/** Token usage counter, labeled by provider and direction (input/output). */
export const llmTokenUsage = meter.createCounter("llm_token_usage", {
  description: "LLM token usage by provider and direction",
});
