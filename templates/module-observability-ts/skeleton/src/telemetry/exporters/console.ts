import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import { ConsoleMetricExporter } from "@opentelemetry/sdk-metrics";
import type { SpanExporter } from "@opentelemetry/sdk-trace";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace";
import { registerExporter } from "./registry.js";
import type { TelemetryExporter } from "./types.js";

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
