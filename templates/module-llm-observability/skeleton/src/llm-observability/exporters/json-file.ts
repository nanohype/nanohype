import { appendFileSync } from "node:fs";
import type { LlmSpan, CostEntry } from "../types.js";
import type { LlmExporter } from "./types.js";
import { registerExporter } from "./registry.js";

// ── JSON File Exporter ─────────────────────────────────────────────
//
// Appends LLM spans and cost entries as JSONL (one JSON object per
// line) to a file. Useful for local analysis, log aggregation, or
// offline cost auditing.
//
// Configure via environment variable:
//   LLM_OBS_LOG_PATH (default: llm-observations.jsonl)
//

function createJsonFileExporter(): LlmExporter {
  const logPath = process.env["LLM_OBS_LOG_PATH"] ?? "llm-observations.jsonl";
  const buffer: string[] = [];

  return {
    name: "json-file",

    exportSpan(span: LlmSpan): void {
      const line = JSON.stringify({ type: "span", ...span });
      buffer.push(line);

      // Flush every 50 entries to avoid unbounded memory growth
      if (buffer.length >= 50) {
        flushSync();
      }
    },

    exportCost(entry: CostEntry): void {
      const line = JSON.stringify({ type: "cost", ...entry });
      buffer.push(line);

      if (buffer.length >= 50) {
        flushSync();
      }
    },

    async flush(): Promise<void> {
      flushSync();
    },
  };

  function flushSync(): void {
    if (buffer.length === 0) return;
    const data = buffer.join("\n") + "\n";
    buffer.length = 0;
    appendFileSync(logPath, data, "utf-8");
  }
}

registerExporter("json-file", createJsonFileExporter);
