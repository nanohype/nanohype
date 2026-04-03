import { metrics, type Counter, type Histogram } from "@opentelemetry/api";

// ── LLM Metrics ────────────────────────────────────────────────────
//
// OpenTelemetry metrics for LLM observability. Creates counters and
// histograms scoped to a meter name so each observer instance gets
// its own instruments.
//

const METER_NAME = "llm-observability";

/**
 * Create the standard set of LLM observability metrics.
 *
 * Returns instance-scoped instruments — no module-level state.
 */
export function createLlmMetrics(serviceName: string): LlmMetrics {
  const meter = metrics.getMeter(METER_NAME, "0.1.0");

  const traceTotal = meter.createCounter("llm_trace_total", {
    description: "Total number of traced LLM calls",
    unit: "{call}",
  });

  const traceDuration = meter.createHistogram("llm_trace_duration_ms", {
    description: "Duration of traced LLM calls in milliseconds",
    unit: "ms",
  });

  const qualityScore = meter.createHistogram("llm_quality_score", {
    description: "Recorded quality scores for LLM responses",
    unit: "{score}",
  });

  return {
    recordTrace(model: string, provider: string, durationMs: number, success: boolean) {
      const attributes = {
        "llm.model": model,
        "llm.provider": provider,
        "llm.service": serviceName,
        "llm.success": String(success),
      };
      traceTotal.add(1, attributes);
      traceDuration.record(durationMs, attributes);
    },

    recordQuality(score: number, model?: string) {
      const attributes: Record<string, string> = {
        "llm.service": serviceName,
      };
      if (model) {
        attributes["llm.model"] = model;
      }
      qualityScore.record(score, attributes);
    },
  };
}

export interface LlmMetrics {
  /** Record a traced LLM call. */
  recordTrace(model: string, provider: string, durationMs: number, success: boolean): void;
  /** Record a quality score. */
  recordQuality(score: number, model?: string): void;
}
