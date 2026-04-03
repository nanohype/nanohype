// ── Subtask Router ──────────────────────────────────────────────────
//
// Routes subtasks to agents based on the planner's assignments. If
// the planner assigned an agent that exists in the registry, that
// assignment is used directly. If the agent is not found, the router
// falls back to capability matching and keyword matching to find the
// best available agent.
//

import type { Agent } from "../agents/types.js";
import type { SubTask } from "../types.js";
import {
  createCapabilityMatchStrategy,
  createKeywordMatchStrategy,
  type RoutingStrategy,
} from "./strategies.js";
import { logger } from "../logger.js";

export interface RouterConfig {
  /** Additional routing strategies to try (in order). */
  strategies?: RoutingStrategy[];
}

export interface Router {
  /**
   * Resolve the agent name for a subtask. Returns the agent name
   * to use, or throws if no suitable agent can be found.
   */
  resolve(subtask: SubTask, availableAgents: Agent[]): string;
}

/**
 * Create a new router instance.
 *
 * The router tries these resolution strategies in order:
 * 1. Direct match — the planner's assignedAgent exists in the registry.
 * 2. Capability match — subtask.requiredCapability matches an agent's capability.
 * 3. Keyword match — subtask description words match agent capability keywords.
 * 4. Custom strategies — any additional strategies provided in config.
 */
export function createRouter(config: RouterConfig = {}): Router {
  const strategies: RoutingStrategy[] = [
    createCapabilityMatchStrategy(),
    createKeywordMatchStrategy(),
    ...(config.strategies ?? []),
  ];

  return {
    resolve(subtask: SubTask, availableAgents: Agent[]): string {
      const agentNames = new Set(availableAgents.map((a) => a.name));

      // 1. Direct match — planner's assignment exists
      if (agentNames.has(subtask.assignedAgent)) {
        logger.debug("Router: direct match", {
          subtaskId: subtask.id,
          agent: subtask.assignedAgent,
        });
        return subtask.assignedAgent;
      }

      logger.warn("Router: assigned agent not found, falling back to strategies", {
        subtaskId: subtask.id,
        assignedAgent: subtask.assignedAgent,
      });

      // 2. Try each strategy in order
      for (const strategy of strategies) {
        const ranked = strategy.rank(subtask, availableAgents);
        if (ranked.length > 0) {
          logger.debug("Router: strategy match", {
            subtaskId: subtask.id,
            strategy: strategy.name,
            agent: ranked[0],
          });
          return ranked[0];
        }
      }

      throw new Error(
        `No suitable agent found for subtask "${subtask.id}" ` +
        `(assigned: "${subtask.assignedAgent}", ` +
        `required capability: "${subtask.requiredCapability ?? "none"}")`,
      );
    },
  };
}
