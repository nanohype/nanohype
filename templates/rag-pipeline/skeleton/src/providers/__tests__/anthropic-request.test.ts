/**
 * Tests for the request body the Anthropic provider builds.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any
 * value, the default included, so a body carrying one fails before a
 * model sees it. Generation passes a temperature to every provider;
 * these verify the Anthropic provider keeps it out of the body, and that
 * an instance says once, at debug level, that it dropped it. The SDK
 * client is replaced with a recorder, and the assertions read the body
 * the provider handed it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../logger.js";
import "../anthropic.js";
import { getLlmProvider } from "../registry.js";

const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

describe("anthropic provider request", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      content: [{ type: "text", text: "Rollbacks restore the previous release." }],
      usage: { input_tokens: 40, output_tokens: 8 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends no sampling parameters", async () => {
    const result = await getLlmProvider("anthropic", "test-key").generate(
      "Answer from the context.",
      "How do rollbacks work?",
      "claude-sonnet-5",
      0.1,
      512,
    );

    expect(create).toHaveBeenCalledOnce();
    const [body] = create.mock.calls[0];
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
    expect(body).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: "Answer from the context.",
      messages: [{ role: "user", content: "How do rollbacks work?" }],
    });
    expect(result).toEqual({
      answer: "Rollbacks restore the previous release.",
      usage: { input_tokens: 40, output_tokens: 8, total_tokens: 48 },
    });
  });

  it("says once per instance, at debug level, that it dropped the temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () =>
      debug.mock.calls.filter(([message]) => message === "anthropic sends no temperature");
    const provider = getLlmProvider("anthropic", "test-key");

    await provider.generate("Answer.", "First question?", "claude-sonnet-5", 0.1, 512);
    await provider.generate("Answer.", "Second question?", "claude-sonnet-5", 0.1, 512);
    expect(dropped()).toEqual([["anthropic sends no temperature", { temperature: 0.1 }]]);

    await getLlmProvider("anthropic", "test-key").generate(
      "Answer.",
      "Third question?",
      "claude-sonnet-5",
      0.1,
      512,
    );
    expect(dropped()).toHaveLength(2);
  });
});
