import type { GatewayProvider, ProviderPricing } from "./types.js";
import type { ChatMessage, GatewayResponse, ChatOptions } from "../types.js";
import { registerProvider } from "./registry.js";

// ── Mock Provider ───────────────────────────────────────────────────
//
// Deterministic provider for testing. Returns keyword-matched
// responses with fake token counts. No external dependencies or
// API keys required.
//

const RESPONSES: Record<string, string> = {
  hello: "Hello! How can I help you today?",
  code: "Here is a simple function:\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}",
  explain: "This concept works by breaking the problem into smaller parts and solving each one.",
  summarize: "In summary: the key points are efficiency, clarity, and maintainability.",
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

const mockProvider: GatewayProvider = {
  name: "mock",

  pricing: {
    input: 0,
    output: 0,
  } satisfies ProviderPricing,

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
    const model = opts?.model ?? "mock-model";
    const start = performance.now();
    const text = matchResponse(messages);
    const latencyMs = performance.now() - start;

    // Fake token counts: ~4 chars per token
    const inputText = messages.map((m) => m.content).join(" ");
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(text.length / 4);

    return {
      text,
      model,
      provider: this.name,
      inputTokens,
      outputTokens,
      latencyMs,
      cached: false,
      cost: 0,
    };
  },

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  },
};

// Self-register
registerProvider(mockProvider);
