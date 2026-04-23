# module-observability-ts

Composable OpenTelemetry instrumentation module with pluggable exporters for traces, metrics, and structured logging.

## What you get

- OpenTelemetry SDK setup with one-call initialization
- Exporter registry (console, OTLP, Datadog) — add custom exporters via the registry
- Tracer wrapper with `withSpan()` for async operations
- Metrics helpers for counters and histograms (conditional)
- Structured JSON logger with automatic trace context injection
- Graceful shutdown support

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `OpenTelemetry instrumentation module` | Description |
| `Exporter` | string | `console` | Default exporter (console/otlp/datadog or custom) |
| `IncludeMetrics` | bool | `true` | Include metrics helpers |
| `IncludeTracing` | bool | `true` | Include tracing helpers |

## Project layout

```text
src/telemetry/
  index.ts              # initTelemetry() / shutdownTelemetry()
  tracer.ts             # getTracer(), withSpan()
  metrics.ts            # (optional) createCounter(), createHistogram()
  logger.ts             # Structured logger with trace context
  exporters/
    registry.ts         # Exporter registry
    console.ts          # Console exporter
    otlp.ts             # OTLP exporter (Grafana/Jaeger)
    datadog.ts          # Datadog exporter
    __tests__/
      registry.test.ts
      logger.test.ts
```

## Pairs with

- [ts-service](../ts-service/) -- add observability to a TypeScript HTTP service
- [go-service](../go-service/) -- add observability to a Go HTTP service
- [agentic-loop](../agentic-loop/) -- instrument an AI agent with tracing and metrics
- [mcp-server-ts](../mcp-server-ts/) -- add observability to an MCP server

## Nests inside

- [monorepo](../monorepo/)
