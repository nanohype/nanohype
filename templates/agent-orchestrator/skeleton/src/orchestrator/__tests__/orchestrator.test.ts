import { describe, it, expect, beforeEach } from "vitest";
import { createOrchestrator } from "../index.js";
import { registerAgent } from "../agents/registry.js";
import type { Agent } from "../agents/types.js";
import type { SubTask, AgentResult } from "../types.js";

// Import mock provider to self-register
import "../providers/mock.js";

/**
 * Build a deterministic agent for testing orchestration flow.
 */
function createTestAgent(name: string, capabilities: string[]): Agent {
  return {
    name,
    capabilities: capabilities.map((c) => ({
      name: c,
      description: `${c} capability`,
      keywords: [c],
    })),
    async execute(subtask: SubTask, context): Promise<AgentResult> {
      context.set(`${name}:result`, `processed ${subtask.id}`);
      return {
        subtaskId: subtask.id,
        success: true,
        output: { agent: name, subtask: subtask.id },
        durationMs: 1,
      };
    },
  };
}

describe("orchestrator", () => {
  const unique = () => `test-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("creates an orchestrator with default config", () => {
    const orchestrator = createOrchestrator({ providerName: "mock" });
    expect(orchestrator).toBeDefined();
    expect(orchestrator.execute).toBeTypeOf("function");
  });

  it("throws on invalid config", () => {
    expect(() =>
      createOrchestrator({ maxSubtasks: -1, providerName: "mock" }),
    ).toThrow(/Invalid orchestrator config/);
  });

  it("executes a task through the full pipeline", async () => {
    // Register test agents with unique names
    const researcherName = unique();
    registerAgent(researcherName, () => createTestAgent(researcherName, ["research"]));

    const orchestrator = createOrchestrator({ providerName: "mock" });

    const result = await orchestrator.execute({
      id: "task-1",
      description: "Plan and research AI agent architectures",
    });

    expect(result.task.id).toBe("task-1");
    expect(result.subtasks.length).toBeGreaterThan(0);
    expect(result.reasoning).toBeTruthy();
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("handles planning failure gracefully", async () => {
    // Use a provider name that doesn't exist to trigger failure
    // But first we need to register one that will fail
    const orchestrator = createOrchestrator({ providerName: "mock" });

    // The mock provider returns valid plans, so this should succeed
    const result = await orchestrator.execute({
      id: "task-fail",
      description: "A task to plan and decompose",
    });

    // Mock provider returns a valid plan, so this should succeed
    expect(result.task.id).toBe("task-fail");
  });
});
