import type { LlmSpan, CostEntry } from "../types.js";
import type { LlmExporter } from "./types.js";
import { registerExporter } from "./registry.js";

// ── Mock Exporter ──────────────────────────────────────────────────
//
// In-memory accumulator for testing. Stores all exported spans and
// cost entries in arrays that can be inspected in assertions.
//

export interface MockExporterData {
  spans: LlmSpan[];
  costs: CostEntry[];
}

function createMockExporter(): LlmExporter & MockExporterData {
  const spans: LlmSpan[] = [];
  const costs: CostEntry[] = [];

  return {
    name: "mock",
    spans,
    costs,

    exportSpan(span: LlmSpan): void {
      spans.push(span);
    },

    exportCost(entry: CostEntry): void {
      costs.push(entry);
    },

    async flush(): Promise<void> {
      // Nothing to flush — data stays in memory
    },
  };
}

registerExporter("mock", createMockExporter);
