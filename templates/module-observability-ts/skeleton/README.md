# __PROJECT_NAME__

__DESCRIPTION__

A composable [OpenTelemetry](https://opentelemetry.io/) instrumentation module for TypeScript services. Provides tracing, metrics, and structured logging with a single initialization call.

## Getting Started

```bash
npm install
npm run build
```

## Usage

```ts
import { initTelemetry, getTracer, withSpan, logger } from "./telemetry/index.js";

// Initialize once at startup
const shutdown = initTelemetry({
  serviceName: "__PROJECT_NAME__",
  serviceVersion: "1.0.0",
  exporterName: "__EXPORTER__",
});

// Create spans for tracing
const result = await withSpan("my-component", "handle-request", async (span) => {
  span.setAttribute("request.path", "/api/health");
  logger.info("handling request", { path: "/api/health" });
  return { status: "ok" };
});

// Or use the tracer directly
const tracer = getTracer("my-component");
tracer.startActiveSpan("custom-operation", (span) => {
  // ... your code ...
  span.end();
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
```

## Metrics

```ts
import { createCounter, createHistogram } from "./telemetry/metrics.js";

const requestCount = createCounter("my-service", "http.requests.total", {
  description: "Total HTTP requests received",
});

const latency = createHistogram("my-service", "http.request.duration", {
  description: "HTTP request duration",
  unit: "ms",
});

// Record values
requestCount.add(1, { method: "GET", path: "/api/health" });
latency.record(42, { method: "GET", path: "/api/health" });
```

## Structured Logging

The logger automatically includes trace and span IDs when an active span exists:

```ts
import { logger } from "./telemetry/logger.js";

logger.info("request handled", { path: "/api/health", durationMs: 12 });
// {"timestamp":"...","level":"info","message":"request handled","traceId":"...","spanId":"...","path":"/api/health","durationMs":12}
```

## Exporters

Built-in exporters:

| Exporter  | Description                                      | Configuration                          |
|-----------|--------------------------------------------------|----------------------------------------|
| `console` | Writes to stdout (development)                   | None required                          |
| `otlp`    | OTLP/HTTP (Grafana, Jaeger, any OTEL collector)  | `OTEL_EXPORTER_OTLP_ENDPOINT`          |
| `datadog` | Datadog Agent OTLP ingest                        | `DD_OTLP_ENDPOINT`                     |

### Custom Exporters

Register a custom exporter using the registry pattern:

```ts
import { registerExporter } from "./telemetry/exporters/index.js";
import type { TelemetryExporter } from "./telemetry/exporters/types.js";

class MyExporter implements TelemetryExporter {
  readonly name = "my-backend";
  createSpanExporter() { /* ... */ }
  createMetricExporter() { /* ... */ }
}

registerExporter("my-backend", () => new MyExporter());
```

## Project Structure

```
src/
  telemetry/
    index.ts              # SDK initialization and shutdown
    tracer.ts             # Tracer wrapper for creating spans
    metrics.ts            # Metrics helpers (counters, histograms)
    logger.ts             # Structured logger with trace context
    exporters/
      types.ts            # TelemetryExporter interface
      registry.ts         # Exporter registry
      console.ts          # Console exporter (dev)
      otlp.ts             # OTLP exporter (Grafana/Jaeger)
      datadog.ts          # Datadog exporter
      index.ts            # Barrel import + re-exports
```
