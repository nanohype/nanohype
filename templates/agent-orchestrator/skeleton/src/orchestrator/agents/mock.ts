// ── Mock Agent ──────────────────────────────────────────────────────
//
// Deterministic agent for testing. Returns predictable responses
// based on the subtask description. No external API calls required.
// Each factory call produces an independent instance.
//

import type { Agent, AgentExecutionContext } from "./types.js";
import type { SubTask, AgentResult } from "../types.js";
import { registerAgent } from "./registry.js";

function createMockAgent(): Agent {
  return {
    name: "mock",

    capabilities: [
      {
        name: "mock",
        description: "Deterministic mock agent for testing — handles any subtask",
        keywords: ["test", "mock", "stub"],
      },
    ],

    async execute(subtask: SubTask, context: AgentExecutionContext): Promise<AgentResult> {
      const start = performance.now();

      // Write a deterministic value to shared context
      context.set(`mock:${subtask.id}`, {
        processed: true,
        description: subtask.description,
      });

      return {
        subtaskId: subtask.id,
        success: true,
        output: {
          message: `Mock agent processed subtask: ${subtask.description}`,
          subtaskId: subtask.id,
        },
        durationMs: performance.now() - start,
      };
    },
  };
}

// Self-register
registerAgent("mock", createMockAgent);
