import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
import "../providers/bedrock.js";
import { getProvider } from "../providers/registry.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";

// ── Bedrock Request Tests ──────────────────────────────────────────
//
// Bedrock documents `temperature`, `top_p` and `top_k` per Claude model,
// and no single rule over provider-neutral options meets all of them, so
// the provider sends none to a Claude model id and the caller's values to
// any other model family. These verify both halves against the Converse
// request each mode builds, and that a provider instance says once, at
// debug level, that it dropped them. The SDK client is replaced with a
// recorder; the command classes are the SDK's own, so the assertions read
// the input a real ConverseCommand or ConverseStreamCommand carries.
//

const send = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-bedrock-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-bedrock-runtime")>()),
  BedrockRuntimeClient: class {
    send = send;
  },
}));

const CLAUDE_MODEL_IDS = [
  "us.anthropic.claude-sonnet-5",
  "global.anthropic.claude-opus-5",
  "anthropic.claude-sonnet-5",
  "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-5",
];

const OTHER_MODEL_ID = "meta.llama3-3-70b-instruct-v1:0";

const DROPPED = "bedrock sends no sampling options to a Claude model";

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

function withModel(model: string): ChatOptions {
  return { model, maxTokens: 64, temperature: 0.2, topP: 0.9, stop: ["\n\n"] };
}

/** The input of the command handed to the client on call `n`. */
function sentInput(n = 0): Record<string, unknown> {
  return send.mock.calls[n][0].input;
}

function droppedLogs(debug: { mock: { calls: unknown[][] } }): unknown[][] {
  return debug.mock.calls.filter(([message]) => message === DROPPED);
}

function converseReply(): void {
  send.mockResolvedValue({
    output: { message: { role: "assistant", content: [{ text: "Hello." }] } },
    usage: { inputTokens: 12, outputTokens: 3 },
  });
}

function converseStreamReply(): void {
  send.mockResolvedValue({
    stream: (async function* () {
      yield { contentBlockDelta: { delta: { text: "Hello." } } };
      yield { metadata: { usage: { inputTokens: 12, outputTokens: 3 } } };
    })(),
  });
}

async function drain(response: StreamResponse): Promise<string> {
  const text: string[] = [];
  for await (const chunk of response) {
    text.push(chunk.text);
  }
  return text.join("");
}

describe("bedrock provider request", () => {
  beforeEach(() => {
    send.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(CLAUDE_MODEL_IDS)("chat sends no sampling parameters to %s", async (model) => {
    converseReply();

    await getProvider("bedrock").chat(messages, withModel(model));

    expect(send).toHaveBeenCalledOnce();
    expect(sentInput()).toMatchObject({
      modelId: model,
      system: [{ text: "Answer briefly." }, { cachePoint: { type: "default" } }],
      messages: [{ role: "user", content: [{ text: "Say hello." }] }],
    });
    expect(sentInput().inferenceConfig).toEqual({ maxTokens: 64, stopSequences: ["\n\n"] });
  });

  it("chat sends no sampling parameters to the default model", async () => {
    converseReply();

    await getProvider("bedrock").chat(messages, { maxTokens: 64, temperature: 0.2, topP: 0.9 });

    expect(sentInput().modelId).toBe("us.anthropic.claude-sonnet-5");
    expect(sentInput().inferenceConfig).toEqual({ maxTokens: 64 });
  });

  it("chat sends the caller's values to a model outside the Claude family", async () => {
    converseReply();

    await getProvider("bedrock").chat(messages, withModel(OTHER_MODEL_ID));

    expect(sentInput().inferenceConfig).toEqual({
      maxTokens: 64,
      temperature: 0.2,
      topP: 0.9,
      stopSequences: ["\n\n"],
    });
  });

  it("streamChat sends no sampling parameters to a Claude model", async () => {
    converseStreamReply();

    const response = getProvider("bedrock").streamChat(
      messages,
      withModel("us.anthropic.claude-sonnet-5"),
    );

    expect(await drain(response)).toBe("Hello.");
    expect(sentInput().inferenceConfig).toEqual({ maxTokens: 64, stopSequences: ["\n\n"] });
    await expect(response.response).resolves.toMatchObject({
      text: "Hello.",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("streamChat sends the caller's values to a model outside the Claude family", async () => {
    converseStreamReply();

    const response = getProvider("bedrock").streamChat(messages, withModel(OTHER_MODEL_ID));

    expect(await drain(response)).toBe("Hello.");
    expect(sentInput().inferenceConfig).toEqual({
      maxTokens: 64,
      temperature: 0.2,
      topP: 0.9,
      stopSequences: ["\n\n"],
    });
  });

  it("says once per instance, at debug level, that it dropped them", async () => {
    converseReply();
    const debug = vi.spyOn(logger, "debug");
    const provider = getProvider("bedrock");

    await provider.chat(messages, withModel("us.anthropic.claude-sonnet-5"));
    await provider.chat(messages, withModel("us.anthropic.claude-sonnet-5"));
    expect(droppedLogs(debug)).toEqual([
      [DROPPED, { model: "us.anthropic.claude-sonnet-5", temperature: 0.2, topP: 0.9 }],
    ]);

    await getProvider("bedrock").chat(messages, withModel("us.anthropic.claude-sonnet-5"));
    expect(droppedLogs(debug)).toHaveLength(2);
  });

  it("says nothing when it drops nothing", async () => {
    converseReply();
    const debug = vi.spyOn(logger, "debug");

    await getProvider("bedrock").chat(messages, { model: "us.anthropic.claude-sonnet-5" });
    await getProvider("bedrock").chat(messages, withModel(OTHER_MODEL_ID));

    expect(droppedLogs(debug)).toEqual([]);
  });
});
