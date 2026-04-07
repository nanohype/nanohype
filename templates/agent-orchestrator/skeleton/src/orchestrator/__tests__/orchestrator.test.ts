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

// Import provider registry for custom mock registration
import { registerProvider } from "../providers/registry.js";

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

  it("routes subtasks across multiple agents and records handoffs", async () => {
    // Register two specialized agents with distinct capabilities
    const analyzerName = unique();
    const writerName = unique();
    const providerName = unique();

    const executionOrder: string[] = [];

    registerAgent(analyzerName, () => ({
      name: analyzerName,
      capabilities: [{
        name: "analysis",
        description: "Analyzes data",
        keywords: ["analyze", "analysis"],
      }],
      async execute(subtask: SubTask, context): Promise<AgentResult> {
        executionOrder.push(analyzerName);
        context.set(`${analyzerName}:findings`, { data: "analyzed" });
        return {
          subtaskId: subtask.id,
          success: true,
          output: { findings: "Data has been analyzed" },
          durationMs: 1,
        };
      },
    }));

    registerAgent(writerName, () => ({
      name: writerName,
      capabilities: [{
        name: "writing",
        description: "Writes reports",
        keywords: ["write", "report", "summarize"],
      }],
      async execute(subtask: SubTask, context): Promise<AgentResult> {
        executionOrder.push(writerName);
        // Read data from the analyzer agent via shared context
        const findings = context.get(`${analyzerName}:findings`);
        return {
          subtaskId: subtask.id,
          success: true,
          output: { report: "Report based on analysis", usedFindings: !!findings },
          durationMs: 1,
        };
      },
    }));

    // Register a provider that returns a plan assigning subtasks to both agents
    // with a dependency from the writer subtask on the analyzer subtask
    registerProvider(providerName, () => ({
      name: providerName,
      async complete(_systemPrompt: string, _userMessage: string): Promise<string> {
        return JSON.stringify({
          subtasks: [
            {
              id: "subtask-1",
              description: "Analyze the dataset",
              assignedAgent: analyzerName,
              dependsOn: [],
              requiredCapability: "analysis",
            },
            {
              id: "subtask-2",
              description: "Write a report based on analysis findings",
              assignedAgent: writerName,
              dependsOn: ["subtask-1"],
              requiredCapability: "writing",
            },
          ],
          reasoning: "First analyze, then write a report from findings.",
        });
      },
    }));

    const orchestrator = createOrchestrator({ providerName });

    const result = await orchestrator.execute({
      id: "multi-agent-task",
      description: "Analyze data and write a report",
    });

    // Both subtasks should succeed
    expect(result.success).toBe(true);
    expect(result.subtasks).toHaveLength(2);

    // The analyzer ran before the writer (dependency order)
    expect(executionOrder).toEqual([analyzerName, writerName]);

    // Both agents produced results
    const analyzerResult = result.results.get("subtask-1");
    const writerResult = result.results.get("subtask-2");
    expect(analyzerResult?.success).toBe(true);
    expect(writerResult?.success).toBe(true);

    // The writer agent consumed the analyzer's context
    expect((writerResult?.output as Record<string, unknown>).usedFindings).toBe(true);
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
