/**
 * Mock LLM provider for local development without API keys.
 *
 * Returns contextual responses based on keyword matching against the
 * user message. Registers itself as the "mock" LLM provider on import.
 */

import type { LlmProvider } from "./types.js";
import { registerLlmProvider } from "./registry.js";

const KEYWORD_RESPONSES: Record<string, string> = {
  weather:
    "Based on current conditions, the forecast shows clear skies with temperatures around 72°F (22°C). Humidity is at 45% with light winds from the southwest at 8 mph.",
  code:
    "Here's a clean implementation approach: define the interface with clear type boundaries, implement the core logic using pure functions, add error handling at the boundary layer, and write unit tests covering edge cases.",
  summarize:
    "The document covers three main topics: system architecture and design decisions, implementation details with code examples, and deployment procedures including monitoring setup. The key takeaway is that a layered approach reduces complexity while maintaining flexibility.",
  explain:
    "This concept works through three interconnected mechanisms: first, the input is validated and normalized; second, the core transformation applies domain-specific rules; third, the output is formatted and cached for subsequent requests.",
};

const DEFAULT_RESPONSE =
  "Based on the provided context, the answer involves several key factors. The primary consideration is maintaining consistency across the data pipeline while ensuring each transformation step is idempotent and reversible. Additional context from the source documents supports this approach.";

class MockLlm implements LlmProvider {
  async generate(
    _systemPrompt: string,
    userMessage: string,
    _model: string,
    _temperature: number,
    _maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    const lower = userMessage.toLowerCase();
    let answer = DEFAULT_RESPONSE;

    for (const [keyword, response] of Object.entries(KEYWORD_RESPONSES)) {
      if (lower.includes(keyword)) {
        answer = response;
        break;
      }
    }

    return {
      answer,
      usage: {
        input_tokens: Math.ceil(userMessage.length / 4),
        output_tokens: Math.ceil(answer.length / 4),
        total_tokens: Math.ceil(userMessage.length / 4) + Math.ceil(answer.length / 4),
      },
    };
  }
}

registerLlmProvider("mock", () => new MockLlm());
