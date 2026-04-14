import type { LlmProvider } from "./types.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  StreamResponse,
  StreamChunk,
  Pricing,
} from "../types.js";
import { registerProvider } from "./registry.js";

// ── Mock Provider ──────────────────────────────────────────────────
//
// Deterministic provider for testing. Returns keyword-matched
// responses with fake token counts. No external dependencies or
// API keys required. Always included in the module.
//

const RESPONSES: Record<string, string> = {
  hello: "Hello! How can I help you today?",
  code: "Here is a simple function:\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}",
  explain: "This concept works by breaking the problem into smaller parts and solving each one.",
  summarize: "In summary: the key points are efficiency, clarity, and maintainability.",
  translate: "Translation: the text has been converted to the target language.",
  debug: "The issue is caused by an off-by-one error in the loop condition.",
  refactor: "The code has been refactored to use dependency injection for better testability.",
  review: "Code review: the implementation is solid with minor suggestions for improvement.",
};

const DEFAULT_RESPONSE = "This is a mock response for testing purposes.";

function matchResponse(messages: ChatMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return DEFAULT_RESPONSE;

  const content = lastMessage.content.toLowerCase();
  for (const [keyword, response] of Object.entries(RESPONSES)) {
    if (content.includes(keyword)) return response;
  }
  return DEFAULT_RESPONSE;
}

function createMockProvider(): LlmProvider {
  const pricing: Pricing = { input: 0, output: 0 };

  return {
    name: "mock",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? "mock-model";
      const start = performance.now();
      const text = matchResponse(messages);
      const latencyMs = performance.now() - start;

      const inputText = messages.map((m) => m.content).join(" ");
      const usage = {
        inputTokens: Math.ceil(inputText.length / 4),
        outputTokens: Math.ceil(text.length / 4),
      };

      return {
        text,
        model,
        provider: "mock",
        usage,
        latencyMs,
        cost: 0,
      };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? "mock-model";

      let resolveResponse: (value: LlmResponse) => void;
      const responsePromise = new Promise<LlmResponse>((resolve) => {
        resolveResponse = resolve;
      });

      async function* generate(): AsyncGenerator<StreamChunk> {
        const start = performance.now();
        const text = matchResponse(messages);

        // Simulate streaming by yielding word-by-word
        const words = text.split(" ");
        for (let i = 0; i < words.length; i++) {
          const chunk = i < words.length - 1 ? words[i] + " " : words[i];
          yield { text: chunk, done: false };
        }

        // Resolve the response promise before yielding done — consumers
        // often break the iteration on done, which would leave this
        // generator paused and the response promise unresolved forever.
        const latencyMs = performance.now() - start;
        const inputText = messages.map((m) => m.content).join(" ");
        const usage = {
          inputTokens: Math.ceil(inputText.length / 4),
          outputTokens: Math.ceil(text.length / 4),
        };

        resolveResponse!({
          text,
          model,
          provider: "mock",
          usage,
          latencyMs,
          cost: 0,
        });

        yield { text: "", done: true };
      }

      const iterator = generate();

      return {
        [Symbol.asyncIterator]() {
          return iterator;
        },
        response: responsePromise,
      };
    },

    countTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
  };
}

// Self-register factory
registerProvider("mock", createMockProvider);
