// ── Core Orchestrator ───────────────────────────────────────────────
//
// The orchestration loop:
//   1. Receive a task
//   2. Call the planner agent to decompose it into subtasks
//   3. Topologically sort subtasks by dependencies
//   4. For each subtask, resolve the agent via the router
//   5. Execute the agent with a scoped shared context
//   6. Record handoffs between agents
//   7. Aggregate all results
//
// Each execution produces an OrchestratorResult containing subtasks,
// per-agent results, handoff trail, and timing information.
//

import type {
  Task,
  SubTask,
  AgentResult,
  OrchestratorResult,
  PlannerResult,
} from "./types.js";
import type { ValidatedConfig } from "./config.js";
import { createSharedContext, type SharedContext } from "./context/shared.js";
import { createHandoffProtocol, type HandoffProtocol } from "./context/handoff.js";
import { createRouter, type Router } from "./routing/router.js";
import { getAgent, getAllAgents } from "./agents/index.js";
import { createPlannerAgent } from "./agents/planner.js";
import { logger } from "./logger.js";
import {
  taskTotal,
  subtaskTotal,
  agentDuration,
  orchestrationDuration,
} from "./metrics.js";

// ── Topological Sort ────────────────────────────────────────────────

function topologicalSort(subtasks: SubTask[]): SubTask[] {
  const byId = new Map(subtasks.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const sorted: SubTask[] = [];

  function visit(id: string, path: Set<string>): void {
    if (visited.has(id)) return;
    if (path.has(id)) {
      throw new Error(`Circular dependency detected: ${[...path, id].join(" -> ")}`);
    }

    const subtask = byId.get(id);
    if (!subtask) return;

    path.add(id);
    for (const depId of subtask.dependsOn) {
      visit(depId, path);
    }
    path.delete(id);

    visited.add(id);
    sorted.push(subtask);
  }

  for (const subtask of subtasks) {
    visit(subtask.id, new Set());
  }

  return sorted;
}

// ── Orchestration Execution ─────────────────────────────────────────

export interface OrchestratorInstance {
  /** Execute a task through the full orchestration pipeline. */
  execute(task: Task): Promise<OrchestratorResult>;
}

export function createOrchestratorInstance(config: ValidatedConfig): OrchestratorInstance {
  const router: Router = createRouter();
  const sharedContext: SharedContext = createSharedContext();
  const handoffProtocol: HandoffProtocol = createHandoffProtocol();

  return {
    async execute(task: Task): Promise<OrchestratorResult> {
      const start = performance.now();
      taskTotal.add(1);

      logger.info("Orchestration started", { taskId: task.id, description: task.description });

      // Reset state for this execution
      sharedContext.clear();
      handoffProtocol.clear();

      // Store task input in shared context
      if (task.input) {
        for (const [key, value] of Object.entries(task.input)) {
          sharedContext.set(key, value);
        }
      }

      // Step 1: Plan — decompose the task into subtasks
      const planner = createPlannerAgent() as ReturnType<typeof createPlannerAgent> & {
        setProvider(name: string): void;
        setCapabilities(caps: Array<{ name: string; description: string; keywords?: string[] }>): void;
        plan(description: string): Promise<PlannerResult>;
      };

      planner.setProvider(config.providerName);

      // Gather capabilities from all registered agents
      const allAgents = getAllAgents();
      const allCapabilities = allAgents.flatMap((a) => a.capabilities);
      planner.setCapabilities(allCapabilities);

      let plan: PlannerResult;
      try {
        plan = await planner.plan(task.description);
      } catch (err) {
        logger.error("Planning failed", {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          task,
          subtasks: [],
          results: new Map(),
          success: false,
          durationMs: performance.now() - start,
          reasoning: `Planning failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Enforce subtask limit
      const subtasks = plan.subtasks.slice(0, config.maxSubtasks);
      subtaskTotal.add(subtasks.length);

      logger.info("Plan created", {
        taskId: task.id,
        subtaskCount: subtasks.length,
        reasoning: plan.reasoning,
      });

      // Step 2: Sort subtasks by dependency order
      let sorted: SubTask[];
      try {
        sorted = topologicalSort(subtasks);
      } catch (err) {
        logger.error("Dependency resolution failed", {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          task,
          subtasks,
          results: new Map(),
          success: false,
          durationMs: performance.now() - start,
          reasoning: plan.reasoning,
        };
      }

      // Step 3: Execute subtasks in dependency order
      const results = new Map<string, AgentResult>();
      let previousAgent: string | null = null;

      for (const subtask of sorted) {
        // Check timeout
        if (performance.now() - start > config.timeoutMs) {
          logger.warn("Orchestration timeout", { taskId: task.id });
          break;
        }

        // Wait for dependencies (already ensured by topo sort,
        // but verify they succeeded)
        const depsFailed = subtask.dependsOn.some((depId) => {
          const depResult = results.get(depId);
          return !depResult || !depResult.success;
        });

        if (depsFailed) {
          logger.warn("Skipping subtask due to failed dependency", {
            subtaskId: subtask.id,
          });
          results.set(subtask.id, {
            subtaskId: subtask.id,
            success: false,
            output: null,
            error: "Skipped: dependency failed",
            durationMs: 0,
          });
          continue;
        }

        // Resolve the agent
        let agentName: string;
        try {
          agentName = router.resolve(subtask, allAgents);
        } catch (err) {
          logger.error("Agent resolution failed", {
            subtaskId: subtask.id,
            error: err instanceof Error ? err.message : String(err),
          });
          results.set(subtask.id, {
            subtaskId: subtask.id,
            success: false,
            output: null,
            error: err instanceof Error ? err.message : String(err),
            durationMs: 0,
          });
          continue;
        }

        // Record handoff
        if (previousAgent && previousAgent !== agentName) {
          handoffProtocol.record({
            fromAgent: previousAgent,
            toAgent: agentName,
            reason: `Subtask "${subtask.id}" requires ${agentName}`,
            subtaskId: subtask.id,
          });
        }

        // Execute the agent
        const agent = getAgent(agentName);
        const scopedContext = sharedContext.scopedFor(agentName);

        logger.debug("Executing subtask", {
          subtaskId: subtask.id,
          agent: agentName,
        });

        const agentStart = performance.now();
        let result: AgentResult;
        try {
          result = await agent.execute(subtask, scopedContext);
        } catch (err) {
          result = {
            subtaskId: subtask.id,
            success: false,
            output: null,
            error: err instanceof Error ? err.message : String(err),
            durationMs: performance.now() - agentStart,
          };
        }

        agentDuration.record(result.durationMs, { agent: agentName });
        results.set(subtask.id, result);
        previousAgent = agentName;

        logger.info("Subtask completed", {
          subtaskId: subtask.id,
          agent: agentName,
          success: result.success,
          durationMs: result.durationMs,
        });
      }

      const totalDuration = performance.now() - start;
      orchestrationDuration.record(totalDuration);

      const allSucceeded = Array.from(results.values()).every((r) => r.success);

      logger.info("Orchestration completed", {
        taskId: task.id,
        success: allSucceeded,
        subtaskCount: sorted.length,
        durationMs: totalDuration,
        handoffs: handoffProtocol.count(),
      });

      return {
        task,
        subtasks: sorted,
        results,
        success: allSucceeded,
        durationMs: totalDuration,
        reasoning: plan.reasoning,
      };
    },
  };
}
