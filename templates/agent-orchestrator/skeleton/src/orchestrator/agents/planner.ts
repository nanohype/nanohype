// ── Planner Agent ───────────────────────────────────────────────────
//
// LLM-powered agent that decomposes a top-level task into ordered
// subtasks with agent assignments and dependency declarations. The
// planner receives the task description plus available agent
// capabilities, and returns a structured plan.
//
// The planner does not execute subtasks itself — it only produces the
// decomposition that the orchestrator then routes to specialized agents.
//

import { z } from "zod";
import type { Agent, AgentExecutionContext } from "./types.js";
import type { AgentCapability, SubTask, AgentResult, PlannerResult } from "../types.js";
import { getProvider } from "../providers/index.js";
import { registerAgent } from "./registry.js";
import { logger } from "../logger.js";

const SubTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignedAgent: z.string(),
  dependsOn: z.array(z.string()).default([]),
  requiredCapability: z.string().optional(),
});

const PlanSchema = z.object({
  subtasks: z.array(SubTaskSchema),
  reasoning: z.string(),
});

function buildSystemPrompt(availableCapabilities: AgentCapability[]): string {
  const capabilityList = availableCapabilities
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");

  return `You are a task planner for a multi-agent system. Your job is to decompose a task into subtasks that can be executed by specialized agents.

Available agent capabilities:
${capabilityList}

You MUST respond with valid JSON matching this schema:
{
  "subtasks": [
    {
      "id": "subtask-1",
      "description": "What this subtask does",
      "assignedAgent": "agent-name",
      "dependsOn": [],
      "requiredCapability": "capability-name"
    }
  ],
  "reasoning": "Why you decomposed the task this way"
}

Rules:
- Each subtask must have a unique id (use subtask-1, subtask-2, etc.)
- assignedAgent should match an available agent name
- dependsOn lists subtask IDs that must complete first
- Order subtasks so dependencies come before dependents
- Keep the decomposition focused — avoid unnecessary subtasks`;
}

function createPlannerAgent(): Agent {
  let providerName = "mock";
  let availableCapabilities: AgentCapability[] = [];

  const agent: Agent & {
    setProvider(name: string): void;
    setCapabilities(caps: AgentCapability[]): void;
    plan(taskDescription: string): Promise<PlannerResult>;
  } = {
    name: "planner",

    capabilities: [
      {
        name: "planning",
        description: "Decomposes complex tasks into ordered subtasks with dependency management",
        keywords: ["plan", "decompose", "organize", "schedule"],
      },
    ],

    /** Override the LLM provider for this planner instance. */
    setProvider(name: string): void {
      providerName = name;
    },

    /** Set the available capabilities for planning context. */
    setCapabilities(caps: AgentCapability[]): void {
      availableCapabilities = caps;
    },

    /**
     * Decompose a task description into subtasks.
     * Called by the orchestrator before routing begins.
     */
    async plan(taskDescription: string): Promise<PlannerResult> {
      const provider = getProvider(providerName);
      const systemPrompt = buildSystemPrompt(availableCapabilities);

      logger.debug("Planner invoking LLM", { providerName, taskDescription });

      const response = await provider.complete(systemPrompt, taskDescription);

      let parsed: z.infer<typeof PlanSchema>;
      try {
        parsed = PlanSchema.parse(JSON.parse(response));
      } catch (err) {
        logger.error("Failed to parse planner response", {
          error: err instanceof Error ? err.message : String(err),
          response,
        });
        throw new Error(`Planner produced invalid plan: ${err instanceof Error ? err.message : String(err)}`);
      }

      logger.info("Planner decomposed task", {
        subtaskCount: parsed.subtasks.length,
        reasoning: parsed.reasoning,
      });

      return parsed;
    },

    async execute(subtask: SubTask, context: AgentExecutionContext): Promise<AgentResult> {
      const start = performance.now();
      try {
        const taskDescription = subtask.description;
        const result = await agent.plan(taskDescription);
        context.set("plan", result);

        return {
          subtaskId: subtask.id,
          success: true,
          output: result,
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          subtaskId: subtask.id,
          success: false,
          output: null,
          error: err instanceof Error ? err.message : String(err),
          durationMs: performance.now() - start,
        };
      }
    },
  };

  return agent;
}

// Self-register
registerAgent("planner", createPlannerAgent);

export { createPlannerAgent };
