import type { LlmProvider, LlmMessage, LlmOptions } from "./types.js";
import { registerLlmProvider } from "./registry.js";

class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async complete(messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return "No user message provided.";
    }

    const content = lastUser.content.toLowerCase();

    if (content.includes("ingest") || content.includes("extract") || content.includes("page")) {
      return JSON.stringify({
        title: "Mock Page",
        type: "entity",
        content: "This is mock-generated content based on the provided source material.",
        links: [],
        confidence: "inferred",
      });
    }

    if (content.includes("query") || content.includes("question") || content.includes("answer")) {
      return "Mock answer based on wiki content.";
    }

    if (content.includes("contradict")) {
      return JSON.stringify({
        contradictions: [],
        summary: "No contradictions detected.",
      });
    }

    return "Mock LLM response.";
  }
}

registerLlmProvider("mock", () => new MockLlmProvider());
