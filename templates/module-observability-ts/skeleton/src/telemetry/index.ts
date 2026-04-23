import { validateBootstrap } from "./bootstrap.js";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { getExporter } from "./exporters/index.js";
import { logger } from "./logger.js";

/**
 * OpenTelemetry SDK initialization and lifecycle management.
 *
 * Call initTelemetry() once at application startup. The returned
 * shutdown function should be called during graceful shutdown to
 * flush all pending telemetry data.
 */

export interface TelemetryConfig {
  /** Service name reported in telemetry data. */
  serviceName: string;
  /** Service version reported in telemetry data. */
  serviceVersion?: string;
  /** Exporter name — must match a registered exporter (console, otlp, datadog). */
  exporterName?: string;
  /** Metric export interval in milliseconds. Default: 60000. */
  metricIntervalMs?: number;
}

let sdk: NodeSDK | undefined;

/**
 * Initialize the OpenTelemetry SDK with the given configuration.
 *
 * Sets up tracing and metrics pipelines using the specified exporter.
 * Returns a shutdown function that flushes pending data and tears
 * down the SDK.
 *
 * @example
 * ```ts
 * const shutdown = initTelemetry({
 *   serviceName: "my-service",
 *   serviceVersion: "1.0.0",
 *   exporterName: "__EXPORTER__",
 * });
 *
 * // On SIGTERM / SIGINT:
 * await shutdown();
 * ```
 */
export function initTelemetry(config: TelemetryConfig): () => Promise<void> {
  validateBootstrap();

  if (sdk) {
    logger.warn("Telemetry SDK already initialized — skipping re-initialization");
    return () => shutdownTelemetry();
  }

  const exporterName = config.exporterName ?? "__EXPORTER__";
  const exporter = getExporter(exporterName);

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion ?? "0.0.0",
  });

  const spanExporter = exporter.createSpanExporter();
  const metricExporter = exporter.createMetricExporter();

  const sdkConfig: ConstructorParameters<typeof NodeSDK>[0] = {
    resource,
  };

  if (spanExporter) {
    sdkConfig.spanProcessors = [new BatchSpanProcessor(spanExporter)];
  }

  if (metricExporter) {
    sdkConfig.metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: config.metricIntervalMs ?? 60_000,
    });
  }

  sdk = new NodeSDK(sdkConfig);
  sdk.start();

  logger.info("Telemetry initialized", {
    serviceName: config.serviceName,
    exporter: exporterName,
  });

  return () => shutdownTelemetry();
}

/**
 * Gracefully shut down the OpenTelemetry SDK, flushing all
 * pending spans and metrics before the process exits.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    logger.warn("Telemetry SDK not initialized — nothing to shut down");
    return;
  }

  logger.info("Shutting down telemetry SDK...");
  try {
    await sdk.shutdown();
    logger.info("Telemetry SDK shut down successfully");
  } catch (error) {
    logger.error("Error shutting down telemetry SDK", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    sdk = undefined;
  }
}

// Re-export public API from submodules
export { getTracer, withSpan, withSpanSync } from "./tracer.js";
export { logger } from "./logger.js";
export { getExporter, listExporters, registerExporter } from "./exporters/index.js";
export type { TelemetryExporter } from "./exporters/types.js";
