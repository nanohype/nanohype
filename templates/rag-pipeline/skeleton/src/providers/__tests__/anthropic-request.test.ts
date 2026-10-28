/**
 * Tests for the request body the Anthropic provider builds.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any
 * value, the default included, so a body carrying one fails before a
 * model sees it. Generation passes the configured temperature to every
 * provider; these verify the Anthropic provider keeps it out of the body,
 * and that an instance says once, at debug level, that it dropped one the
 * configuration set. The provider runs the real SDK client over a `fetch`
 * that answers in-process, so the assertions read the body the SDK put on
 * the wire, and no request leaves the process.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../logger.js";
import { AnthropicLlm } from "../anthropic.js";
import { getLlmProvider } from "../registry.js";

/** A Messages API that answers every request with one text message. */
function fakeMessagesApi() {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "Rollbacks restore the previous release." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 8 },
    });
  };
  const provider = new AnthropicLlm("test-key", { fetch: fetch as typeof globalThis.fetch });
  return { sent, provider };
}

const DROPPED = "anthropic sends no temperature";

describe("anthropic provider request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends no sampling parameters when the configuration sets a temperature", async () => {
    const { sent, provider } = fakeMessagesApi();

    const result = await provider.generate(
      "Answer from the context.",
      "How do rollbacks work?",
      "claude-sonnet-5",
      0.1,
      512,
    );

    expect(sent).toEqual([
      {
        model: "claude-sonnet-5",
        max_tokens: 512,
        system: "Answer from the context.",
        messages: [{ role: "user", content: "How do rollbacks work?" }],
      },
    ]);
    expect(result).toEqual({
      answer: "Rollbacks restore the previous release.",
      usage: { input_tokens: 40, output_tokens: 8, total_tokens: 48 },
    });
  });

  it("says once per instance, at debug level, that it dropped the temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () => debug.mock.calls.filter(([message]) => message === DROPPED);
    const { provider } = fakeMessagesApi();

    await provider.generate("Answer.", "First question?", "claude-sonnet-5", 0.1, 512);
    await provider.generate("Answer.", "Second question?", "claude-sonnet-5", 0.1, 512);
    expect(dropped()).toEqual([[DROPPED, { temperature: 0.1 }]]);

    await fakeMessagesApi().provider.generate("Answer.", "Third?", "claude-sonnet-5", 0, 512);
    expect(dropped()).toHaveLength(2);
  });

  it("says nothing when the configuration sets no temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const { provider } = fakeMessagesApi();

    await provider.generate("Answer.", "First question?", "claude-sonnet-5", undefined, 512);

    expect(debug.mock.calls.filter(([message]) => message === DROPPED)).toEqual([]);
  });

  it("is the provider the registry builds for anthropic", () => {
    expect(getLlmProvider("anthropic", "test-key")).toBeInstanceOf(AnthropicLlm);
  });
});
