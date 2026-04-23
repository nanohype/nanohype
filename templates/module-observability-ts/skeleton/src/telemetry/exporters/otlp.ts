import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { SpanExporter } from "@opentelemetry/sdk-trace-node";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import type { TelemetryExporter } from "./types.js";
import { registerExporter } from "./registry.js";

/**
 * OTLP exporter — sends spans and metrics over HTTP to any
 * OpenTelemetry-compatible backend (Grafana, Jaeger, etc.).
 *
 * Configure endpoints via standard OTEL environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT      (default: http://localhost:4318)
 *   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
 *   OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
 */
class OtlpTelemetryExporter implements TelemetryExporter {
  readonly name = "otlp";

  createSpanExporter(): SpanExporter {
    return new OTLPTraceExporter();
  }

  createMetricExporter(): PushMetricExporter {
    return new OTLPMetricExporter();
  }
}

registerExporter("otlp", () => new OtlpTelemetryExporter());
