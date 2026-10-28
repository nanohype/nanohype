import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
import { createAnthropicProvider } from "../providers/anthropic.js";
import type { ChatMessage, ChatOptions } from "../types.js";

// ── Anthropic Request Tests ────────────────────────────────────────
//
// The Messages API rejects `temperature`, `top_p` and `top_k` at any
// value, the default included, so a body carrying one fails before a
// model sees it. ChatOptions keeps `temperature` and `topP` for the
// providers whose APIs accept them; these verify the Anthropic provider
// keeps both out of the body in each request mode, that its `sampling`
// hook declares what the body carries, and that an instance says once,
// at debug level, that it dropped them. The provider runs the real SDK
// client over a `fetch` that answers in-process, a JSON message for a
// request and an event stream for a streamed one, so the assertions read
// the body the SDK put on the wire, and no request leaves the process.
//

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = {
  model: "claude-sonnet-5",
  maxTokens: 64,
  temperature: 0.2,
  topP: 0.9,
  stop: ["\n\n"],
};

const MESSAGE = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [{ type: "text", text: "Hello." }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 3 },
};

/** The server-sent events of one streamed message whose text is `text`. */
function messageEvents(text: string): string {
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message: { ...MESSAGE, content: [] } }],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

/** A Messages API that answers with one text message, streamed when asked. */
function fakeMessagesApi() {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push(body);
    if (body.stream) {
      return new Response(messageEvents("Hello."), {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json(MESSAGE);
  };
  const provider = createAnthropicProvider({
    client: { apiKey: "test-key", maxRetries: 0, fetch: fetch as typeof globalThis.fetch },
  });
  return { sent, provider };
}

/** The sampling fields a Messages API body carries. */
function samplingIn(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => ["temperature", "top_p", "top_k"].includes(key)),
  );
}

function expectNoSampling(body: Record<string, unknown>): void {
  expect(samplingIn(body)).toEqual({});
  expect(body).toMatchObject({
    model: "claude-sonnet-5",
    max_tokens: 64,
    system: "Answer briefly.",
    messages: [{ role: "user", content: "Say hello." }],
    stop_sequences: ["\n\n"],
  });
}

describe("anthropic provider request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("chat sends no sampling parameters when the caller sets them", async () => {
    const { sent, provider } = fakeMessagesApi();

    const response = await provider.chat(messages, opts);

    expect(sent).toHaveLength(1);
    expectNoSampling(sent[0]);
    expect(response).toMatchObject({
      text: "Hello.",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("streamChat sends no sampling parameters when the caller sets them", async () => {
    const { sent, provider } = fakeMessagesApi();

    const response = provider.streamChat(messages, opts);
    const text: string[] = [];
    for await (const chunk of response) {
      text.push(chunk.text);
    }

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ stream: true });
    expectNoSampling(sent[0]);
    expect(text.join("")).toBe("Hello.");
    await expect(response.response).resolves.toMatchObject({
      text: "Hello.",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it.each<ChatOptions>([opts, { temperature: 0 }, {}])(
    "declares the sampling options its request carries for %o",
    async (requestOpts) => {
      const { sent, provider } = fakeMessagesApi();

      await provider.chat(messages, requestOpts);

      expect(provider.sampling?.(requestOpts)).toEqual({});
      expect(samplingIn(sent[0])).toEqual(provider.sampling?.(requestOpts));
    },
  );

  it("says once per instance, at debug level, that it dropped them", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () =>
      debug.mock.calls.filter(([message]) => message === "anthropic sends no sampling options");
    const { provider } = fakeMessagesApi();

    await provider.chat(messages, { model: "claude-sonnet-5" });
    expect(dropped()).toEqual([]);

    await provider.chat(messages, opts);
    await provider.chat(messages, opts);
    expect(dropped()).toEqual([
      ["anthropic sends no sampling options", { temperature: 0.2, topP: 0.9 }],
    ]);

    await fakeMessagesApi().provider.chat(messages, { temperature: 0 });
    expect(dropped()).toHaveLength(2);
  });
});
