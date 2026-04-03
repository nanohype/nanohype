import { metrics } from "@opentelemetry/api";

// ── LLM Provider Metrics ──────────────────────────────────────────
//
// OTel counters and histograms for LLM provider observability.
// Tracks request totals, latency, and token usage per provider.
// No-ops unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter(process.env.npm_package_name ?? "__PROJECT_NAME__");

/** Total LLM provider requests, labeled by provider and model. */
export const llmProviderRequestTotal = meter.createCounter(
  "llm_provider_request_total",
  {
    description: "Total LLM provider requests by provider and model",
  },
);

/** LLM provider request duration in milliseconds, labeled by provider. */
export const llmProviderDurationMs = meter.createHistogram(
  "llm_provider_duration_ms",
  {
    description: "LLM provider request latency in milliseconds",
    unit: "ms",
  },
);

/** Token usage per request, labeled by provider, model, and direction (input/output). */
export const llmProviderTokenUsage = meter.createCounter(
  "llm_provider_token_usage",
  {
    description: "Token usage by provider, model, and direction",
  },
);
