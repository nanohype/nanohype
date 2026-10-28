import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlmProvider } from "../llm/anthropic.js";
import { getLlmProvider } from "../llm/index.js";

/**
 * The request the Anthropic provider builds and the response it accepts.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any value, the
 * default included, so a body carrying one fails before a model sees it. The
 * provider runs the real SDK client over a `fetch` that answers in-process, so
 * the assertions read the body the SDK put on the wire, and no request leaves
 * the process.
 */

/** A Messages API that answers every request with a message of `content`. */
function fakeMessagesApi(content: unknown[] = [{ type: "text", text: "an answer" }]) {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 8 },
    });
  };
  const provider = new AnthropicLlmProvider({
    maxRetries: 0,
    fetch: fetch as typeof globalThis.fetch,
  });
  return { sent, provider };
}

const ASK = [
  { role: "system" as const, content: "You maintain a wiki." },
  { role: "user" as const, content: "What does the wiki say about rollbacks?" },
];

describe("anthropic llm provider request", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("carries no sampling parameters", async () => {
    const { sent, provider } = fakeMessagesApi();

    const answer = await provider.complete(ASK, { model: "claude-sonnet-5", maxTokens: 256 });

    expect(answer).toBe("an answer");
    expect(sent).toEqual([
      {
        model: "claude-sonnet-5",
        max_tokens: 256,
        system: "You maintain a wiki.",
        messages: [{ role: "user", content: "What does the wiki say about rollbacks?" }],
      },
    ]);
  });

  it("sends the default model and token limit, and no system prompt it was not given", async () => {
    const { sent, provider } = fakeMessagesApi();

    await provider.complete([ASK[1]]);

    expect(sent).toEqual([
      {
        model: "claude-sonnet-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: "What does the wiki say about rollbacks?" }],
      },
    ]);
  });

  it("refuses a response with no text block", async () => {
    const { provider } = fakeMessagesApi([
      { type: "tool_use", id: "toolu_test", name: "lookup", input: {} },
    ]);

    await expect(provider.complete(ASK)).rejects.toThrow("No text content in Anthropic response");
  });

  it("refuses to run without ANTHROPIC_API_KEY, before any request", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { sent, provider } = fakeMessagesApi();

    await expect(provider.complete(ASK)).rejects.toThrow(
      "ANTHROPIC_API_KEY environment variable is required",
    );
    expect(sent).toEqual([]);
  });

  it("builds its client from ANTHROPIC_API_KEY on first use and keeps it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { sent, provider } = fakeMessagesApi();
    await expect(provider.complete(ASK)).rejects.toThrow();

    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    await provider.complete(ASK);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await provider.complete(ASK);

    expect(sent).toHaveLength(2);
  });

  it("is the provider the registry builds for anthropic", () => {
    expect(getLlmProvider("anthropic")).toBeInstanceOf(AnthropicLlmProvider);
  });
});
