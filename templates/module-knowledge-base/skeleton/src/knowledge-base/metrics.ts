import { metrics } from "@opentelemetry/api";

// ── Knowledge Base Metrics ─────────────────────────────────────────
//
// OTel counters and histograms for knowledge base observability.
// Tracks request totals and latency per provider and operation.
// No-ops unless an OTel SDK is wired in by the consumer.
//

const meter = metrics.getMeter(process.env.npm_package_name ?? "__PROJECT_NAME__");

/** Total knowledge base requests, labeled by provider and operation. */
export const knowledgeBaseRequestTotal = meter.createCounter(
  "knowledge_base_request_total",
  {
    description: "Total knowledge base requests by provider and operation",
  },
);

/** Knowledge base request duration in milliseconds, labeled by provider and operation. */
export const knowledgeBaseDurationMs = meter.createHistogram(
  "knowledge_base_duration_ms",
  {
    description: "Knowledge base request latency in milliseconds",
    unit: "ms",
  },
);
