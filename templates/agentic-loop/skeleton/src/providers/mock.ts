import type { Tool } from "../tools/registry.js";
import type {
  LlmProvider,
  Message,
  ContentBlock,
  LlmResponse,
  StreamChat,
} from "./types.js";
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
    "Here's a clean implementation approach:\n\n1. Define the interface with clear type boundaries\n2. Implement the core logic using pure functions\n3. Add error handling at the boundary layer\n4. Write unit tests covering edge cases\n\nThis follows separation of concerns and keeps each component testable in isolation.",
  error:
    "I've identified the issue. The root cause is a type mismatch in the data transformation layer. The upstream value is arriving as a string when a number is expected. Adding a coercion step with validation at the boundary should resolve this cleanly.",
  test:
    "I recommend a three-tier testing strategy:\n\n- **Unit tests**: Cover pure functions and isolated logic (fast, deterministic)\n- **Integration tests**: Verify component interactions with real dependencies\n- **End-to-end tests**: Validate critical user flows through the full stack\n\nAim for 80% coverage on core business logic.",
  deploy:
    "The recommended deployment pipeline:\n\n1. Run the full test suite and type checks\n2. Build the production artifacts\n3. Deploy to staging for smoke tests\n4. Promote to production with a canary rollout\n5. Monitor error rates and latency for 15 minutes before full rollout",
};

const DEFAULT_RESPONSE =
  "I've analyzed your request and have a structured response ready. The key considerations are: scope definition, implementation approach, and validation criteria. Would you like me to elaborate on any specific aspect, or should I proceed with a detailed breakdown?";

function pickResponse(messages: Message[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return DEFAULT_RESPONSE;

  const text =
    typeof lastUser.content === "string"
      ? lastUser.content
      : Array.isArray(lastUser.content)
        ? lastUser.content
            .filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join(" ")
        : "";

  const lower = text.toLowerCase();
  for (const [keyword, response] of Object.entries(KEYWORD_RESPONSES)) {
    if (lower.includes(keyword)) return response;
  }
  return DEFAULT_RESPONSE;
}

class MockProvider implements LlmProvider {
  async sendMessage(
    _systemPrompt: string,
    messages: Message[],
    _tools: Tool[],
  ): Promise<LlmResponse> {
    const text = pickResponse(messages);
    const content: ContentBlock[] = [{ type: "text", text }];
    const rawAssistantMessage: Message = { role: "assistant", content };

    return {
      content,
      toolCalls: [],
      stopReason: "end_turn",
      rawAssistantMessage,
    };
  }

  streamChat(
    _systemPrompt: string,
    messages: Message[],
    _tools: Tool[],
  ): StreamChat {
    const text = pickResponse(messages);
    const content: ContentBlock[] = [{ type: "text", text }];
    const rawAssistantMessage: Message = { role: "assistant", content };

    let resolveResponse!: (value: LlmResponse) => void;
    const response = new Promise<LlmResponse>((resolve) => {
      resolveResponse = resolve;
    });

    async function* chunks(): AsyncGenerator<string> {
      const words = text.split(/(\s+)/);
      for (const word of words) {
        yield word;
      }
      resolveResponse({
        content,
        toolCalls: [],
        stopReason: "end_turn",
        rawAssistantMessage,
      });
    }

    return {
      [Symbol.asyncIterator]: () => chunks(),
      response,
    };
  }

  makeToolResultMessage(toolCallId: string, result: string): Message {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolCallId,
          content: result,
        },
      ],
    };
  }
}

registerProvider("mock", () => new MockProvider());
