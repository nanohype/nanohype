import type { LlmSpan, CostEntry } from "../types.js";
import type { LlmExporter } from "./types.js";
import { registerExporter } from "./registry.js";

// ── Console Exporter ───────────────────────────────────────────────
//
// Pretty-prints LLM spans and cost entries to stdout. Useful during
// local development and debugging.
//

function createConsoleExporter(): LlmExporter {
  return {
    name: "console",

    exportSpan(span: LlmSpan): void {
      const status = span.success ? "OK" : "ERROR";
      const cost = span.cost > 0 ? ` $${span.cost.toFixed(6)}` : "";
      console.log(
        `[LLM] ${status} ${span.provider}/${span.model} ` +
        `${span.durationMs}ms ` +
        `in=${span.inputTokens} out=${span.outputTokens}${cost}` +
        (span.error ? ` err="${span.error}"` : ""),
      );
    },

    exportCost(entry: CostEntry): void {
      console.log(
        `[LLM:COST] ${entry.provider}/${entry.model} ` +
        `$${entry.cost.toFixed(6)} ` +
        `in=${entry.inputTokens} out=${entry.outputTokens}`,
      );
    },

    async flush(): Promise<void> {
      // Console output is unbuffered — nothing to flush
    },
  };
}

registerExporter("console", createConsoleExporter);
