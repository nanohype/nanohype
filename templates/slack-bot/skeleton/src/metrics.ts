import { metrics } from "@opentelemetry/api";

// ── Application Metrics ────────────────────────────────────────────
//
// RED-style counters plus Bedrock token accounting via the OTel metrics API.
// No-ops unless an OTel SDK is registered — the Dockerfile loads
// @opentelemetry/auto-instrumentations-node via NODE_OPTIONS, which wires a
// MeterProvider exporting to the cluster collector. The meter name matches the
// project so dashboards can filter by service.

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total LLM chat requests, labeled by provider + model. */
export const llmRequestsTotal = meter.createCounter("llm_requests_total", {
  description: "Total LLM chat requests",
});

/** LLM chat requests that threw, labeled by provider + model. */
export const llmErrorsTotal = meter.createCounter("llm_errors_total", {
  description: "Total LLM chat requests that errored",
});

/** LLM call latency in milliseconds. */
export const llmDuration = meter.createHistogram("llm_request_duration_ms", {
  description: "LLM chat latency in milliseconds",
  unit: "ms",
});

/** Token usage by kind (input/output/cache_read/cache_write). Cost is derived
 *  downstream from these counts; cache_read/cache_write surface the prompt-cache
 *  hit ratio the LLM policy requires. */
export const llmTokensTotal = meter.createCounter("llm_tokens_total", {
  description: "LLM token usage by kind",
});

export interface TokenUsage {
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function recordLlmTokens(u: TokenUsage): void {
  const base = { provider: u.provider, model: u.model };
  llmTokensTotal.add(u.input, { ...base, kind: "input" });
  llmTokensTotal.add(u.output, { ...base, kind: "output" });
  llmTokensTotal.add(u.cacheRead, { ...base, kind: "cache_read" });
  llmTokensTotal.add(u.cacheWrite, { ...base, kind: "cache_write" });
}
