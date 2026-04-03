// ── Agent Orchestrator — Main Exports ───────────────────────────────
//
// Public API for the agent orchestrator module. Import agents and
// providers so they self-register, then expose createOrchestrator
// as the primary entry point.
//

import { validateBootstrap } from "./bootstrap.js";
import { OrchestratorConfigSchema } from "./config.js";
import { createOrchestratorInstance } from "./orchestrator.js";
import type {
  Task,
  SubTask,
  AgentCapability,
  AgentResult,
  PlannerResult,
  OrchestratorConfig,
  OrchestratorResult,
} from "./types.js";
import type { Agent, AgentExecutionContext } from "./agents/types.js";
import type { LlmProvider } from "./providers/types.js";

// Re-export everything consumers need
export { registerAgent, getAgent, listAgents, getAllAgents } from "./agents/index.js";
export { registerProvider, getProvider, listProviders } from "./providers/index.js";
export { createSharedContext } from "./context/shared.js";
export { createHandoffProtocol } from "./context/handoff.js";
export { createRouter } from "./routing/router.js";
export type {
  Task,
  SubTask,
  AgentCapability,
  AgentResult,
  PlannerResult,
  OrchestratorConfig,
  OrchestratorResult,
} from "./types.js";
export type { Agent, AgentExecutionContext } from "./agents/types.js";
export type { LlmProvider } from "./providers/types.js";
export type { SharedContext, ScopedContext } from "./context/shared.js";
export type { HandoffProtocol, HandoffRecord } from "./context/handoff.js";
export type { Router } from "./routing/router.js";

// ── Orchestrator Facade ─────────────────────────────────────────────

export interface Orchestrator {
  /**
   * Execute a task through the full orchestration pipeline:
   * plan → route → execute agents → aggregate results.
   */
  execute(task: Task): Promise<OrchestratorResult>;
}

/**
 * Create a configured orchestrator instance.
 *
 * Agents and providers must be registered before creating the
 * orchestrator (built-in agents and providers self-register on
 * import via their barrel modules).
 *
 *   const orchestrator = createOrchestrator({ providerName: "anthropic" });
 *   const result = await orchestrator.execute({
 *     id: "task-1",
 *     description: "Research and analyze the AI agent landscape",
 *   });
 */
export function createOrchestrator(
  config: OrchestratorConfig = {},
): Orchestrator {
  const parsed = OrchestratorConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid orchestrator config: ${issues}`);
  }

  validateBootstrap();

  const instance = createOrchestratorInstance(parsed.data);

  return {
    execute: (task: Task) => instance.execute(task),
  };
}
