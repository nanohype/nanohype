# module-llm-observability

AI-specific telemetry module with LLM call tracing, cost tracking, quality monitoring, and pluggable exporters.

## What you get

- `createLlmObserver(config)` facade wrapping all subsystems in one instance
- `trace(fn)` wraps any async LLM call, capturing model, provider, tokens, latency, and cost
- Per-model cost calculator reusing the llm-gateway pricing table pattern (conditional)
- Cost anomaly detection via z-score analysis on rolling windows (conditional)
- Quality monitor with sliding-window stats: avg, p50, p95, and trend detection
- Exporter registry (console, OTLP, JSON file, mock) — add custom exporters via factory pattern
- OpenTelemetry metrics: `llm_trace_total`, `llm_trace_duration_ms`, `llm_quality_score`
- No module-level mutable state — all instances are factory-scoped

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `LLM observability module with tracing, cost tracking, and quality monitoring` | Description |
| `Exporter` | string | `console` | Default exporter (console/otlp/json-file or custom) |
| `IncludeCostTracking` | bool | `true` | Include cost tracking and anomaly detection |

## Project layout

```text
src/llm-observability/
  index.ts                  # createLlmObserver() facade
  types.ts                  # LlmSpan, LlmEvent, CostEntry, QualityScore, ObserverConfig
  bootstrap.ts              # Placeholder validation
  logger.ts                 # Structured logger with trace context
  metrics.ts                # OTel metrics: llm_trace_total, llm_trace_duration_ms, llm_quality_score
  tracer/
    index.ts                # LlmTracer: trace(fn) wraps async LLM call
    types.ts                # TracerOptions, SpanContext
  cost/                     # (conditional on IncludeCostTracking)
    calculator.ts           # CostCalculator factory: record(span), query(filters)
    pricing.ts              # Per-model pricing table (same models as llm-gateway)
    anomaly.ts              # detectAnomalies() via z-score
    types.ts                # CostEntry, CostFilters, CostSummary
  quality/
    monitor.ts              # QualityMonitor factory: record(), getStats()
    types.ts                # QualityScore, QualityStats, QualityWindow
  exporters/
    types.ts                # LlmExporter interface
    registry.ts             # Factory-based exporter registry
    console.ts              # Pretty-print to stdout
    otlp.ts                 # OTLP span export via OTel API
    json-file.ts            # Append to JSONL file
    mock.ts                 # In-memory accumulator for testing
    index.ts                # Barrel with side-effect registrations
  __tests__/
    tracer.test.ts          # trace wrapping, span capture, error handling
    quality.test.ts         # score recording, p50/p95, regression detection
    cost.test.ts            # pricing, aggregation, anomaly detection
    registry.test.ts        # exporter registry
```

## Pairs with

- [ts-service](../ts-service/) — add LLM observability to a TypeScript HTTP service
- [agentic-loop](../agentic-loop/) — instrument an AI agent with tracing, cost, and quality monitoring
- [rag-pipeline](../rag-pipeline/) — track retrieval-augmented generation costs and quality
- [module-llm-gateway](../module-llm-gateway/) — layer observability on top of a unified LLM gateway

## Nests inside

- [monorepo](../monorepo/)
