// ── Routing Strategies ──────────────────────────────────────────────
//
// Pluggable strategies for matching subtasks to agents. Each strategy
// takes a subtask and a list of available agents, and returns a
// ranked list of candidate agent names.
//
// Two built-in strategies:
//   keyword-match     — matches subtask description words against
//                       agent capability keywords.
//   capability-match  — matches subtask requiredCapability against
//                       agent capability names.
//

import type { Agent } from "../agents/types.js";
import type { SubTask } from "../types.js";

/** A routing strategy that ranks agents for a subtask. */
export interface RoutingStrategy {
  /** Strategy name for logging and debugging. */
  name: string;

  /**
   * Score agents for a subtask. Returns agent names sorted by
   * relevance (highest score first). Agents with score 0 are excluded.
   */
  rank(subtask: SubTask, agents: Agent[]): string[];
}

// ── Keyword Match Strategy ──────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export function createKeywordMatchStrategy(): RoutingStrategy {
  return {
    name: "keyword-match",

    rank(subtask: SubTask, agents: Agent[]): string[] {
      const subtaskWords = new Set(tokenize(subtask.description));
      if (subtask.input) {
        const inputStr = JSON.stringify(subtask.input);
        for (const word of tokenize(inputStr)) {
          subtaskWords.add(word);
        }
      }

      const scored: Array<{ name: string; score: number }> = [];

      for (const agent of agents) {
        let score = 0;
        for (const cap of agent.capabilities) {
          const keywords = cap.keywords ?? [];
          for (const keyword of keywords) {
            const kwWords = tokenize(keyword);
            for (const kw of kwWords) {
              if (subtaskWords.has(kw)) {
                score += 1;
              }
            }
          }
          // Also match against capability name
          for (const word of tokenize(cap.name)) {
            if (subtaskWords.has(word)) {
              score += 2; // Capability name match is stronger
            }
          }
        }
        if (score > 0) {
          scored.push({ name: agent.name, score });
        }
      }

      return scored
        .sort((a, b) => b.score - a.score)
        .map((s) => s.name);
    },
  };
}

// ── Capability Match Strategy ───────────────────────────────────────

export function createCapabilityMatchStrategy(): RoutingStrategy {
  return {
    name: "capability-match",

    rank(subtask: SubTask, agents: Agent[]): string[] {
      if (!subtask.requiredCapability) return [];

      const required = subtask.requiredCapability.toLowerCase();
      const matches: string[] = [];

      for (const agent of agents) {
        for (const cap of agent.capabilities) {
          if (cap.name.toLowerCase() === required) {
            matches.push(agent.name);
            break;
          }
        }
      }

      return matches;
    },
  };
}
