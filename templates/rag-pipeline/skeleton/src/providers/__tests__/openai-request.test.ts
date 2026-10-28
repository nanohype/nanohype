/**
 * Tests for the requests the OpenAI providers build.
 *
 * LLM_TEMPERATURE is optional, so the configuration can say it set none, and
 * the OpenAI LLM then sends 0.1. These hold the configuration and the LLM to
 * that together: the temperature `loadConfig` reads is the one handed to
 * `generate`, and the assertions read the body the SDK put on the wire. The
 * embedder is held to the request it builds and the order it returns a batch
 * in. The providers run the real SDK client over a `fetch` that answers
 * in-process, so no request leaves the process.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { OpenAIEmbedder, OpenAILlm } from "../openai.js";
import { getEmbeddingProvider, getLlmProvider } from "../registry.js";

/** A Chat Completions API that answers every request with one message. */
function fakeChatCompletions() {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Rollbacks restore the previous release." },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48 },
    });
  };
  const llm = new OpenAILlm("test-key", { fetch: fetch as typeof globalThis.fetch });
  return { sent, llm };
}

/** The temperature the configuration holds with LLM_TEMPERATURE at `value`. */
function configuredTemperature(value: string | undefined): number | undefined {
  vi.stubEnv("LLM_TEMPERATURE", value);
  return loadConfig().generation.temperature;
}

describe("openai llm request", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends 0.1 when the configuration sets no temperature", async () => {
    const temperature = configuredTemperature(undefined);
    const { sent, llm } = fakeChatCompletions();

    const result = await llm.generate(
      "Answer from the context.",
      "How do rollbacks work?",
      "gpt-4o",
      temperature,
      512,
    );

    expect(temperature).toBeUndefined();
    expect(sent).toEqual([
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Answer from the context." },
          { role: "user", content: "How do rollbacks work?" },
        ],
        temperature: 0.1,
        max_tokens: 512,
      },
    ]);
    expect(result).toEqual({
      answer: "Rollbacks restore the previous release.",
      usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48 },
    });
  });

  it.each([
    ["0", 0],
    ["0.7", 0.7],
  ])("sends LLM_TEMPERATURE=%s as %s", async (value, expected) => {
    const { sent, llm } = fakeChatCompletions();

    await llm.generate(
      "Answer.",
      "How do rollbacks work?",
      "gpt-4o",
      configuredTemperature(value),
      512,
    );

    expect(sent[0].temperature).toBe(expected);
  });

  it("is the provider the registry builds for openai", () => {
    expect(getLlmProvider("openai", "test-key")).toBeInstanceOf(OpenAILlm);
  });
});

/** An Embeddings API that answers each request with `replies` in turn. */
function fakeEmbeddings(...replies: { index: number; embedding: number[] }[][]) {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const data = replies[sent.length - 1].map((item) => ({ object: "embedding", ...item }));
    return Response.json({
      object: "list",
      data,
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 4, total_tokens: 4 },
    });
  };
  const embedder = new OpenAIEmbedder("text-embedding-3-small", 2, 2, "test-key", {
    fetch: fetch as typeof globalThis.fetch,
  });
  return { sent, embedder };
}

describe("openai embedder request", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("asks for an embedding of the configured width", async () => {
    const { sent, embedder } = fakeEmbeddings([{ index: 0, embedding: [0.1, 0.2] }]);

    expect(embedder.dimensions).toBe(2);
    await expect(embedder.embed("rollbacks")).resolves.toEqual([0.1, 0.2]);
    expect(sent).toEqual([
      expect.objectContaining({
        input: ["rollbacks"],
        model: "text-embedding-3-small",
        dimensions: 2,
      }),
    ]);
  });

  it("embeds a batch in slices of the batch size, in input order", async () => {
    const { sent, embedder } = fakeEmbeddings(
      [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
      [{ index: 0, embedding: [1, 1] }],
    );

    await expect(embedder.embedBatch(["first", "second", "third"])).resolves.toEqual([
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    expect(sent.map((body) => body.input)).toEqual([["first", "second"], ["third"]]);
  });

  it("refuses to run without OPENAI_API_KEY", () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    expect(() => new OpenAILlm()).toThrow("OPENAI_API_KEY environment variable is required");
    expect(() => new OpenAIEmbedder()).toThrow("OPENAI_API_KEY environment variable is required");
  });

  it("is the embedder the registry builds for openai", () => {
    expect(getEmbeddingProvider("openai", undefined, 2, 2, "test-key")).toBeInstanceOf(
      OpenAIEmbedder,
    );
  });
});
