/**
 * Tests for the requests the Bedrock providers build.
 *
 * Bedrock restricts `temperature`, `top_p` and `top_k` per Claude model,
 * up to rejecting them outright, so the LLM provider sends none. Generation passes a temperature to every
 * provider; these verify it stays out of the Converse request, and that
 * an instance says once, at debug level, that it dropped it. The embedder
 * is held to the Titan request it builds and the response it accepts. The
 * SDK client is replaced with a recorder; the command classes are the
 * SDK's own, so the assertions read the input a real command carries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../logger.js";
import "../bedrock.js";
import { getEmbeddingProvider, getLlmProvider } from "../registry.js";

const send = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-bedrock-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-bedrock-runtime")>()),
  BedrockRuntimeClient: class {
    send = send;
  },
}));

const MODEL = "us.anthropic.claude-sonnet-5";

describe("bedrock provider request", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({
      output: {
        message: {
          role: "assistant",
          content: [{ text: "Rollbacks restore the previous release." }],
        },
      },
      usage: {
        inputTokens: 40,
        outputTokens: 8,
        totalTokens: 48,
        cacheReadInputTokens: 30,
        cacheWriteInputTokens: 0,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends no sampling parameters", async () => {
    const result = await getLlmProvider("bedrock").generate(
      "Answer from the context.",
      "How do rollbacks work?",
      MODEL,
      0.1,
      512,
    );

    expect(send).toHaveBeenCalledOnce();
    const { input } = send.mock.calls[0][0];
    expect(input).toEqual({
      modelId: MODEL,
      system: [{ text: "Answer from the context." }, { cachePoint: { type: "default" } }],
      messages: [{ role: "user", content: [{ text: "How do rollbacks work?" }] }],
      inferenceConfig: { maxTokens: 512 },
    });
    expect(result).toEqual({
      answer: "Rollbacks restore the previous release.",
      usage: {
        input_tokens: 40,
        output_tokens: 8,
        total_tokens: 48,
        cache_read_tokens: 30,
        cache_write_tokens: 0,
      },
    });
  });

  it("says once per instance, at debug level, that it dropped the temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () =>
      debug.mock.calls.filter(([message]) => message === "bedrock sends no temperature");
    const provider = getLlmProvider("bedrock");

    await provider.generate("Answer.", "First question?", MODEL, 0.1, 512);
    await provider.generate("Answer.", "Second question?", MODEL, 0.1, 512);
    expect(dropped()).toEqual([
      ["bedrock sends no temperature", { model: MODEL, temperature: 0.1 }],
    ]);

    await getLlmProvider("bedrock").generate("Answer.", "Third question?", MODEL, 0.1, 512);
    expect(dropped()).toHaveLength(2);
  });
});

describe("bedrock embedder request", () => {
  /** A Titan InvokeModel response carrying `body` as JSON. */
  function titanReply(body: unknown) {
    return { body: new TextEncoder().encode(JSON.stringify(body)) };
  }

  beforeEach(() => {
    send.mockReset();
  });

  it("asks Titan for a normalized embedding of the configured width", async () => {
    send.mockResolvedValue(titanReply({ embedding: [0.1, 0.2, 0.3] }));
    const embedder = getEmbeddingProvider("bedrock", "amazon.titan-embed-text-v2:0", 3);

    expect(embedder.dimensions).toBe(3);
    await expect(embedder.embed("rollbacks")).resolves.toEqual([0.1, 0.2, 0.3]);

    const { input } = send.mock.calls[0][0];
    expect(input).toMatchObject({
      modelId: "amazon.titan-embed-text-v2:0",
      contentType: "application/json",
      accept: "application/json",
    });
    expect(JSON.parse(input.body)).toEqual({
      inputText: "rollbacks",
      dimensions: 3,
      normalize: true,
    });
  });

  it("embeds a batch one input per call, in order", async () => {
    send
      .mockResolvedValueOnce(titanReply({ embedding: [1, 0] }))
      .mockResolvedValueOnce(titanReply({ embedding: [0, 1] }));
    const embedder = getEmbeddingProvider("bedrock", "amazon.titan-embed-text-v2:0", 2);

    await expect(embedder.embedBatch(["first", "second"])).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(send.mock.calls.map(([command]) => JSON.parse(command.input.body).inputText)).toEqual([
      "first",
      "second",
    ]);
  });

  it("rejects a response without an embedding", async () => {
    send.mockResolvedValue(titanReply({ message: "throttled" }));
    const embedder = getEmbeddingProvider("bedrock", "amazon.titan-embed-text-v2:0", 2);

    await expect(embedder.embed("rollbacks")).rejects.toThrow();
  });
});
