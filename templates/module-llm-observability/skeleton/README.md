# __PROJECT_NAME__

__DESCRIPTION__

AI-specific telemetry module built on [OpenTelemetry](https://opentelemetry.io/). Wraps LLM calls with trace capture, tracks per-request cost, and monitors response quality with sliding-window statistics.

## Getting Started

```bash
npm install
npm run build
```

## Usage

```ts
import { createLlmObserver } from "./llm-observability/index.js";

const observer = createLlmObserver({
  serviceName: "__PROJECT_NAME__",
  exporterName: "__EXPORTER__",
});

// Trace an LLM call
const response = await observer.trace(async () => {
  // Call your LLM provider here
  return {
    text: "Hello, world!",
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    inputTokens: 100,
    outputTokens: 50,
  };
});

// Record quality scores
observer.recordQuality("req-123", 0.92);
observer.recordQuality("req-456", 0.85);

// Get quality statistics
const stats = observer.getQualityStats({ windowSize: 100 });
console.log(stats); // { avg, p50, p95, trend, count }

// Graceful shutdown
await observer.close();
```

## Exporters

Built-in exporters:

| Exporter    | Description                                | Configuration                   |
|-------------|--------------------------------------------|---------------------------------|
| `console`   | Pretty-print to stdout (development)       | None required                   |
| `otlp`      | OTLP span export via OpenTelemetry API     | `OTEL_EXPORTER_OTLP_ENDPOINT`  |
| `json-file` | Append to JSONL file                       | `LLM_OBS_LOG_PATH`             |
| `mock`      | In-memory accumulator (testing)            | None required                   |

### Custom Exporters

Register a custom exporter using the factory-based registry:

```ts
import { registerExporter } from "./llm-observability/exporters/index.js";
import type { LlmExporter } from "./llm-observability/exporters/types.js";

registerExporter("my-backend", () => ({
  name: "my-backend",
  exportSpan(span) { /* ... */ },
  exportCost(entry) { /* ... */ },
  async flush() { /* ... */ },
}));
```

## Project Structure

```
src/
  llm-observability/
    index.ts              # createLlmObserver() facade
    types.ts              # Core type definitions
    bootstrap.ts          # Placeholder validation
    logger.ts             # Structured logger with trace context
    metrics.ts            # OTel metrics helpers
    tracer/
      index.ts            # LlmTracer: trace(fn) wraps async LLM calls
      types.ts            # TracerOptions, SpanContext
    cost/
      calculator.ts       # CostCalculator factory
      pricing.ts          # Per-model pricing table
      anomaly.ts          # Z-score anomaly detection
      types.ts            # Cost-specific types
    quality/
      monitor.ts          # QualityMonitor factory
      types.ts            # Quality-specific types
    exporters/
      types.ts            # LlmExporter interface
      registry.ts         # Factory-based registry
      console.ts          # Console exporter
      otlp.ts             # OTLP exporter
      json-file.ts        # JSONL file exporter
      mock.ts             # Mock exporter for testing
      index.ts            # Barrel imports + re-exports
```
