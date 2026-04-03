import type { LlmSpan, CostEntry } from "../types.js";

// ── LLM Exporter Interface ─────────────────────────────────────────
//
// Each exporter handles span and cost data export. Not every backend
// needs both — implement only what the backend supports and leave
// the other methods as no-ops.
//

export interface LlmExporter {
  /** Unique name used to select this exporter at runtime. */
  readonly name: string;

  /** Export a captured LLM span. */
  exportSpan(span: LlmSpan): void;

  /** Export a cost entry. */
  exportCost(entry: CostEntry): void;

  /** Flush any buffered data. Called during graceful shutdown. */
  flush(): Promise<void>;
}
