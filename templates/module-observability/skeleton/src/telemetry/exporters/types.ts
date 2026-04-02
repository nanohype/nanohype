import type { SpanExporter } from "@opentelemetry/sdk-trace-node";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";

/**
 * Telemetry exporter interface.
 *
 * Each exporter provides factories for trace and metric exporters.
 * Not every backend supports both — return undefined for unsupported
 * signal types, and the SDK will skip that pipeline.
 */
export interface TelemetryExporter {
  /** Unique name used to select this exporter at runtime. */
  readonly name: string;

  /** Create a span exporter for this backend, or undefined if unsupported. */
  createSpanExporter(): SpanExporter | undefined;

  /** Create a metric exporter for this backend, or undefined if unsupported. */
  createMetricExporter(): PushMetricExporter | undefined;
}
