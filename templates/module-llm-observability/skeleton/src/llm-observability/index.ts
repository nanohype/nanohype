// ── LLM Observer Facade ────────────────────────────────────────────
//
// createLlmObserver(config) is the single entry point for the LLM
// observability module. It wires together the tracer, quality monitor,
// cost calculator (optional), exporter, and OTel metrics into one
// instance. All state is scoped to the returned object — no
// module-level mutable state.
//

import { validateBootstrap } from "./bootstrap.js";
import { logger } from "./logger.js";
import { createLlmMetrics } from "./metrics.js";
import { createLlmTracer } from "./tracer/index.js";
import { createQualityMonitor } from "./quality/monitor.js";
import { getExporter } from "./exporters/index.js";
import { ObserverConfigSchema } from "./types.js";
import type { ObserverConfig, LlmResponse, LlmSpan, CostEntry } from "./types.js";
import type { LlmExporter } from "./exporters/types.js";
import type { QualityStats, QualityWindow } from "./quality/types.js";

// Conditional cost imports — tree-shaken when cost/ directory is excluded
let createCostCalculator: (() => ReturnType<typeof import("./cost/calculator.js").createCostCalculator>) | undefined;
let calculateCostFn: ((model: string, inputTokens: number, outputTokens: number) => number) | undefined;

try {
  const costModule = await import("./cost/calculator.js");
  const pricingModule = await import("./cost/pricing.js");
  createCostCalculator = costModule.createCostCalculator;
  calculateCostFn = pricingModule.calculateCost;
} catch {
  // Cost module not included — IncludeCostTracking is false
}

export interface LlmObserver {
  /** Trace an async LLM call, capturing span data and recording cost/metrics. */
  trace(fn: () => Promise<LlmResponse>, tags?: Record<string, string>): Promise<LlmResponse>;
  /** Record a quality score for a request. */
  recordQuality(requestId: string, score: number): void;
  /** Get quality statistics over a sliding window. */
  getQualityStats(window?: QualityWindow): QualityStats;
  /** Get cost entries (empty if cost tracking is disabled). */
  getCosts(filters?: import("./cost/types.js").CostFilters): import("./cost/types.js").CostSummary | null;
  /** Flush exporters and shut down. */
  close(): Promise<void>;
}

/**
 * Create an LLM observer instance that wires together all subsystems.
 *
 * @example
 * ```ts
 * const observer = createLlmObserver({
 *   serviceName: "my-service",
 *   exporterName: "console",
 * });
 *
 * const response = await observer.trace(async () => {
 *   return await callLlm(prompt);
 * });
 *
 * observer.recordQuality("req-123", 0.92);
 * const stats = observer.getQualityStats({ windowSize: 100 });
 *
 * await observer.close();
 * ```
 */
export function createLlmObserver(config: ObserverConfig): LlmObserver {
  validateBootstrap();

  const parsed = ObserverConfigSchema.parse(config);
  const exporterName = parsed.exporterName ?? "console";

  const exporter: LlmExporter = getExporter(exporterName);
  const tracer = createLlmTracer({
    serviceName: parsed.serviceName,
    defaultTags: parsed.defaultTags,
  });
  const qualityMonitor = createQualityMonitor();
  const llmMetrics = createLlmMetrics(parsed.serviceName);

  // Cost calculator — only created if cost tracking is enabled and the module exists
  const costEnabled = parsed.costTracking !== false && createCostCalculator !== undefined;
  const costCalculator = costEnabled ? createCostCalculator!() : undefined;

  logger.info("LLM observer initialized", {
    serviceName: parsed.serviceName,
    exporter: exporterName,
    costTracking: costEnabled,
  });

  async function traceFn(
    fn: () => Promise<LlmResponse>,
    tags: Record<string, string> = {},
  ): Promise<LlmResponse> {
    const { response, span } = await tracer.trace(fn, tags);

    // Calculate and attach cost if enabled
    if (costEnabled && calculateCostFn && span.success) {
      span.cost = calculateCostFn(span.model, span.inputTokens, span.outputTokens);
    }

    // Export span
    exporter.exportSpan(span);

    // Record cost if enabled
    if (costEnabled && costCalculator && span.success) {
      const costEntry = costCalculator.record(span);
      exporter.exportCost(costEntry);
    }

    // Record OTel metrics
    llmMetrics.recordTrace(span.model, span.provider, span.durationMs, span.success);

    return response;
  }

  function recordQuality(requestId: string, score: number): void {
    qualityMonitor.record(requestId, score);
    llmMetrics.recordQuality(score);
  }

  function getQualityStats(window?: QualityWindow): QualityStats {
    return qualityMonitor.getStats(window);
  }

  function getCosts(filters?: import("./cost/types.js").CostFilters): import("./cost/types.js").CostSummary | null {
    if (!costCalculator) return null;
    return costCalculator.query(filters);
  }

  async function close(): Promise<void> {
    logger.info("Shutting down LLM observer...");
    await exporter.flush();
    logger.info("LLM observer shut down successfully");
  }

  return { trace: traceFn, recordQuality, getQualityStats, getCosts, close };
}

// Re-export public API from submodules
export { createLlmTracer } from "./tracer/index.js";
export { createQualityMonitor } from "./quality/monitor.js";
export { getExporter, listExporters, registerExporter } from "./exporters/index.js";
export { logger } from "./logger.js";
export { createLlmMetrics } from "./metrics.js";
export type { LlmExporter } from "./exporters/types.js";
export type { ObserverConfig, LlmSpan, LlmResponse, LlmEvent, CostEntry, QualityScore } from "./types.js";
export type { TracerOptions, SpanContext } from "./tracer/types.js";
export type { QualityStats, QualityWindow } from "./quality/types.js";
