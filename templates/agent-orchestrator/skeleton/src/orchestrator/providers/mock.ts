import type { LlmProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── Mock LLM Provider ───────────────────────────────────────────────
//
// Returns deterministic responses for testing. When the user message
// contains keywords like "plan" or "decompose", returns a valid
// planner-format JSON response. Otherwise returns a generic analysis.
// No external API calls required.
//

function createMockProvider(): LlmProvider {
  return {
    name: "mock",

    async complete(_systemPrompt: string, userMessage: string): Promise<string> {
      const lower = userMessage.toLowerCase();

      // If this looks like a planning request, return a structured plan
      if (lower.includes("plan") || lower.includes("decompose") || lower.includes("break down")) {
        return JSON.stringify({
          subtasks: [
            {
              id: "subtask-1",
              description: "Research the topic thoroughly",
              assignedAgent: "researcher",
              dependsOn: [],
              requiredCapability: "research",
            },
            {
              id: "subtask-2",
              description: "Analyze findings and produce summary",
              assignedAgent: "researcher",
              dependsOn: ["subtask-1"],
              requiredCapability: "research",
            },
          ],
          reasoning: "Mock planner decomposed the task into research and analysis phases.",
        });
      }

      // Default: return a generic research-style response
      return [
        "## Key Findings",
        "",
        "- Finding 1: The topic has been analyzed thoroughly",
        "- Finding 2: Multiple perspectives were considered",
        "- Finding 3: Data supports the initial hypothesis",
        "",
        "## Recommendations",
        "",
        "- Proceed with the proposed approach",
        "- Monitor results and iterate",
      ].join("\n");
    },
  };
}

// Self-register
registerProvider("mock", createMockProvider);
