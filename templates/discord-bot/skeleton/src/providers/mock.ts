import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

// ── Mock LLM Provider ─────────────────────────────────────────────
//
// Returns deterministic, contextual responses based on keyword
// matching against the last user message. No external API calls.
// Useful for local development without API keys.
//

const KEYWORD_RESPONSES: Record<string, string> = {
  weather:
    "Based on current conditions, the forecast shows clear skies with temperatures around 72°F (22°C). Humidity is at 45% with light winds from the southwest at 8 mph. Perfect conditions for outdoor activities.",
  code:
    "Here's a clean implementation approach:\n\n1. Define the interface with clear type boundaries\n2. Implement the core logic using pure functions\n3. Add error handling at the boundary layer\n4. Write unit tests covering edge cases",
  help:
    "I can assist with a variety of tasks:\n\n- Answer questions about your project or codebase\n- Generate code snippets and implementation plans\n- Debug issues and suggest fixes\n- Explain technical concepts\n\nJust ask and I'll do my best to help!",
  deploy:
    "The recommended deployment steps:\n\n1. Run the full test suite\n2. Build production artifacts\n3. Deploy to staging for smoke tests\n4. Promote to production with a canary rollout\n5. Monitor error rates for 15 minutes before full rollout",
  status:
    "All systems are operational. The last deployment completed successfully 2 hours ago. No incidents reported in the past 24 hours. Current uptime: 99.97%.",
};

const DEFAULT_RESPONSE =
  "I've analyzed your request. The key considerations are scope definition, implementation approach, and validation criteria. Would you like me to elaborate on any specific aspect, or should I proceed with a detailed breakdown?";

class MockProvider implements LlmProvider {
  async chat(
    _systemPrompt: string,
    messages: ChatMessage[],
  ): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";
    const lower = text.toLowerCase();

    for (const [keyword, response] of Object.entries(KEYWORD_RESPONSES)) {
      if (lower.includes(keyword)) return response;
    }

    return DEFAULT_RESPONSE;
  }
}

registerProvider("mock", () => new MockProvider());
