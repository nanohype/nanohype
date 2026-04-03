import { describe, it, expect } from "vitest";
import { createRouter } from "../routing/router.js";
import {
  createCapabilityMatchStrategy,
  createKeywordMatchStrategy,
} from "../routing/strategies.js";
import type { Agent } from "../agents/types.js";
import type { SubTask } from "../types.js";

function makeAgent(name: string, capabilities: Array<{ name: string; keywords?: string[] }>): Agent {
  return {
    name,
    capabilities: capabilities.map((c) => ({
      name: c.name,
      description: `${c.name} capability`,
      keywords: c.keywords,
    })),
    async execute() {
      return { subtaskId: "", success: true, output: null, durationMs: 0 };
    },
  };
}

function makeSubtask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: "st-1",
    description: "Test subtask",
    assignedAgent: "unknown-agent",
    dependsOn: [],
    ...overrides,
  };
}

describe("routing", () => {
  const agents: Agent[] = [
    makeAgent("researcher", [
      { name: "research", keywords: ["research", "investigate", "analyze"] },
    ]),
    makeAgent("coder", [
      { name: "code-generation", keywords: ["code", "implement", "build", "program"] },
    ]),
    makeAgent("writer", [
      { name: "writing", keywords: ["write", "document", "summarize"] },
    ]),
  ];

  describe("router", () => {
    it("uses direct match when assigned agent exists", () => {
      const router = createRouter();
      const subtask = makeSubtask({ assignedAgent: "researcher" });

      const resolved = router.resolve(subtask, agents);
      expect(resolved).toBe("researcher");
    });

    it("falls back to capability match when assigned agent not found", () => {
      const router = createRouter();
      const subtask = makeSubtask({
        assignedAgent: "nonexistent",
        requiredCapability: "research",
      });

      const resolved = router.resolve(subtask, agents);
      expect(resolved).toBe("researcher");
    });

    it("falls back to keyword match when capability match fails", () => {
      const router = createRouter();
      const subtask = makeSubtask({
        assignedAgent: "nonexistent",
        description: "Investigate the market trends and analyze competitors",
      });

      const resolved = router.resolve(subtask, agents);
      expect(resolved).toBe("researcher");
    });

    it("throws when no suitable agent found", () => {
      const router = createRouter();
      const subtask = makeSubtask({
        assignedAgent: "nonexistent",
        description: "Deploy infrastructure to production",
      });

      expect(() => router.resolve(subtask, agents)).toThrow(/No suitable agent found/);
    });
  });

  describe("capability-match strategy", () => {
    it("matches by exact capability name", () => {
      const strategy = createCapabilityMatchStrategy();
      const subtask = makeSubtask({ requiredCapability: "research" });

      const ranked = strategy.rank(subtask, agents);
      expect(ranked).toContain("researcher");
    });

    it("is case-insensitive", () => {
      const strategy = createCapabilityMatchStrategy();
      const subtask = makeSubtask({ requiredCapability: "Research" });

      const ranked = strategy.rank(subtask, agents);
      expect(ranked).toContain("researcher");
    });

    it("returns empty when no capability matches", () => {
      const strategy = createCapabilityMatchStrategy();
      const subtask = makeSubtask({ requiredCapability: "painting" });

      const ranked = strategy.rank(subtask, agents);
      expect(ranked).toHaveLength(0);
    });

    it("returns empty when no required capability specified", () => {
      const strategy = createCapabilityMatchStrategy();
      const subtask = makeSubtask();

      const ranked = strategy.rank(subtask, agents);
      expect(ranked).toHaveLength(0);
    });
  });

  describe("keyword-match strategy", () => {
    it("matches subtask description words against agent keywords", () => {
      const strategy = createKeywordMatchStrategy();
      const subtask = makeSubtask({
        description: "Research the latest AI trends",
      });

      const ranked = strategy.rank(subtask, agents);
      expect(ranked[0]).toBe("researcher");
    });

    it("ranks agents by keyword match count", () => {
      const strategy = createKeywordMatchStrategy();
      const subtask = makeSubtask({
        description: "Write and document the research findings",
      });

      const ranked = strategy.rank(subtask, agents);
      // "write" and "document" match writer; "research" matches researcher
      expect(ranked).toContain("writer");
      expect(ranked).toContain("researcher");
    });

    it("returns empty when no keywords match", () => {
      const strategy = createKeywordMatchStrategy();
      const subtask = makeSubtask({
        description: "Deploy infrastructure",
      });

      const ranked = strategy.rank(subtask, agents);
      expect(ranked).toHaveLength(0);
    });
  });
});
