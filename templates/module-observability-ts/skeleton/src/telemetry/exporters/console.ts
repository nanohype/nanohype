import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { ConsoleMetricExporter } from "@opentelemetry/sdk-metrics";
import type { SpanExporter } from "@opentelemetry/sdk-trace-node";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import type { TelemetryExporter } from "./types.js";
import { registerExporter } from "./registry.js";

/**
 * Console exporter — writes spans and metrics to stdout.
 * Useful during local development and debugging.
 */
class ConsoleTelemetryExporter implements TelemetryExporter {
  readonly name = "console";

  createSpanExporter(): SpanExporter {
    return new ConsoleSpanExporter();
  }

  createMetricExporter(): PushMetricExporter {
    return new ConsoleMetricExporter();
  }
}

registerExporter("console", () => new ConsoleTelemetryExporter());
