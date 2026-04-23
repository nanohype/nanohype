import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { SpanExporter } from "@opentelemetry/sdk-trace-node";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import type { TelemetryExporter } from "./types.js";
import { registerExporter } from "./registry.js";

/**
 * Datadog exporter — sends spans and metrics to the Datadog Agent's
 * OTLP ingest endpoint.
 *
 * The Datadog Agent accepts OTLP data on port 4318 by default when
 * `otlp_config.receiver.protocols.http.endpoint` is enabled.
 *
 * Configure via environment variables:
 *   DD_OTLP_ENDPOINT  (default: http://localhost:4318)
 */
class DatadogTelemetryExporter implements TelemetryExporter {
  private readonly endpoint: string;

  constructor() {
    this.endpoint =
      process.env["DD_OTLP_ENDPOINT"] ?? "http://localhost:4318";
  }

  createSpanExporter(): SpanExporter {
    return new OTLPTraceExporter({
      url: `${this.endpoint}/v1/traces`,
    });
  }

  createMetricExporter(): PushMetricExporter {
    return new OTLPMetricExporter({
      url: `${this.endpoint}/v1/metrics`,
    });
  }
}

registerExporter("datadog", () => new DatadogTelemetryExporter());
