import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { LlmSpan, CostEntry } from "../types.js";
import type { LlmExporter } from "./types.js";
import { registerExporter } from "./registry.js";

// ── OTLP Exporter ──────────────────────────────────────────────────
//
// Exports LLM spans as OpenTelemetry spans via the OTel API. Requires
// an OTel SDK to be initialized with an OTLP exporter (the
// module-observability template handles this). Cost entries are
// recorded as span events on a synthetic cost span.
//
// Configure endpoints via standard OTEL environment variables:
//   OTEL_EXPORTER_OTLP_ENDPOINT (default: http://localhost:4318)
//

const TRACER_NAME = "llm-observability";

function createOtlpExporter(): LlmExporter {
  return {
    name: "otlp",

    exportSpan(span: LlmSpan): void {
      const tracer = trace.getTracer(TRACER_NAME);

      tracer.startActiveSpan("llm.call", (otelSpan) => {
        otelSpan.setAttribute("llm.model", span.model);
        otelSpan.setAttribute("llm.provider", span.provider);
        otelSpan.setAttribute("llm.input_tokens", span.inputTokens);
        otelSpan.setAttribute("llm.output_tokens", span.outputTokens);
        otelSpan.setAttribute("llm.duration_ms", span.durationMs);
        otelSpan.setAttribute("llm.cost_usd", span.cost);

        for (const [key, value] of Object.entries(span.tags)) {
          otelSpan.setAttribute(`llm.tag.${key}`, value);
        }

        if (span.success) {
          otelSpan.setStatus({ code: SpanStatusCode.OK });
        } else {
          otelSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: span.error,
          });
        }

        otelSpan.end();
      });
    },

    exportCost(entry: CostEntry): void {
      const tracer = trace.getTracer(TRACER_NAME);

      tracer.startActiveSpan("llm.cost", (otelSpan) => {
        otelSpan.setAttribute("llm.model", entry.model);
        otelSpan.setAttribute("llm.provider", entry.provider);
        otelSpan.setAttribute("llm.cost_usd", entry.cost);
        otelSpan.setAttribute("llm.input_tokens", entry.inputTokens);
        otelSpan.setAttribute("llm.output_tokens", entry.outputTokens);
        otelSpan.setStatus({ code: SpanStatusCode.OK });
        otelSpan.end();
      });
    },

    async flush(): Promise<void> {
      // OTel SDK handles flush on shutdown — nothing to do here
    },
  };
}

registerExporter("otlp", createOtlpExporter);
