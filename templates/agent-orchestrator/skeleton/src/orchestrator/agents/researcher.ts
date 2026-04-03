// ── Researcher Agent ────────────────────────────────────────────────
//
// Example specialized agent that gathers information by reasoning
// about a subtask via the configured LLM provider. In a real
// deployment this agent would call external APIs, search indexes,
// or databases. The LLM provides structured analysis of the
// research topic and writes findings to shared context for
// downstream agents to consume.
//

import type { Agent, AgentExecutionContext } from "./types.js";
import type { SubTask, AgentResult } from "../types.js";
import { getProvider } from "../providers/index.js";
import { registerAgent } from "./registry.js";
import { logger } from "../logger.js";

const SYSTEM_PROMPT = `You are a research agent in a multi-agent system. Your job is to gather and synthesize information about the given topic.

Respond with a structured analysis including:
1. Key findings (bullet points)
2. Relevant context or background
3. Recommendations for next steps

Be concise and factual. Focus on information that would be useful for downstream agents working on related subtasks.`;

function createResearcherAgent(): Agent {
  let providerName = "mock";

  return {
    name: "researcher",

    capabilities: [
      {
        name: "research",
        description: "Gathers and synthesizes information about a topic using LLM reasoning",
        keywords: ["research", "investigate", "analyze", "gather", "find", "explore"],
      },
    ],

    async execute(subtask: SubTask, context: AgentExecutionContext): Promise<AgentResult> {
      const start = performance.now();

      try {
        const provider = getProvider(providerName);

        // Include any relevant shared context in the prompt
        const existingContext = context.getAll();
        const contextSummary = Object.keys(existingContext).length > 0
          ? `\n\nContext from previous agents:\n${JSON.stringify(existingContext, null, 2)}`
          : "";

        const prompt = `${subtask.description}${contextSummary}`;

        logger.debug("Researcher executing", { subtaskId: subtask.id, providerName });

        const response = await provider.complete(SYSTEM_PROMPT, prompt);

        // Write findings to shared context for downstream agents
        context.set(`research:${subtask.id}`, {
          findings: response,
          subtaskId: subtask.id,
          timestamp: new Date().toISOString(),
        });

        return {
          subtaskId: subtask.id,
          success: true,
          output: response,
          durationMs: performance.now() - start,
        };
      } catch (err) {
        logger.error("Researcher failed", {
          subtaskId: subtask.id,
          error: err instanceof Error ? err.message : String(err),
        });

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
}

// Self-register
registerAgent("researcher", createResearcherAgent);
