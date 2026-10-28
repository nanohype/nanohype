import { APIConnectionTimeoutError, type ClientOptions } from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
import { createAnthropicProvider } from "../providers/anthropic.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";

// ── Anthropic Request Tests ────────────────────────────────────────
//
// The Messages API rejects `temperature`, `top_p` and `top_k` at any
// value, the default included, so a body carrying one fails before a
// model sees it. ChatOptions keeps `temperature` and `topP` for the
// providers whose APIs accept them; these verify the Anthropic provider
// keeps both out of the body in each request mode, that its `sampling`
// hook declares what the body carries, and that an instance says once,
// at debug level, that it dropped them. They also hold the client to its
// request timeout and retry count, and the registered instance to a
// lifetime that keeps its log-once state and circuit breaker across a
// registry's requests.
// The provider runs the real SDK client over a `fetch` that answers
// in-process, a JSON message for a request and an event stream for a
// streamed one, so the assertions read the request the SDK put on the
// wire, and no request leaves the process.
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

/**
 * A `fetch` that answers as the Messages API does, with one text message,
 * streamed when asked. It keeps each request body, and the timeout the SDK
 * armed for it, which the SDK reports in whole seconds as the
 * X-Stainless-Timeout header.
 */
function messagesApiFetch() {
  const sent: Record<string, unknown>[] = [];
  const timeouts: (string | null)[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push(body);
    timeouts.push(new Headers(init?.headers).get("x-stainless-timeout"));
    if (body.stream) {
      return new Response(messageEvents("Hello."), {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json(MESSAGE);
  };
  return { sent, timeouts, fetch: fetch as typeof globalThis.fetch };
}

/** A provider over messagesApiFetch(), with `client` over its client options. */
function fakeMessagesApi(client: ClientOptions = {}) {
  const { sent, timeouts, fetch } = messagesApiFetch();
  const provider = createAnthropicProvider({
    client: { apiKey: "test-key", maxRetries: 0, fetch, ...client },
  });
  return { sent, timeouts, provider };
}

async function drain(response: StreamResponse): Promise<string> {
  const text: string[] = [];
  for await (const chunk of response) {
    text.push(chunk.text);
  }
  return text.join("");
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
    const text = await drain(response);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ stream: true });
    expectNoSampling(sent[0]);
    expect(text).toBe("Hello.");
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

describe("anthropic provider request timeout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives each attempt 120 seconds by default, in both request modes", async () => {
    const { timeouts, provider } = fakeMessagesApi();

    await provider.chat(messages, opts);
    await drain(provider.streamChat(messages, opts));

    expect(timeouts).toEqual(["120", "120"]);
  });

  it("takes LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import("../providers/anthropic.js");
    const { timeouts, fetch } = messagesApiFetch();

    await fresh
      .createAnthropicProvider({ client: { apiKey: "test-key", maxRetries: 0, fetch } })
      .chat(messages, opts);

    expect(timeouts).toEqual(["5"]);
  });

  it("keeps a timeout the caller's client options set", async () => {
    const { timeouts, provider } = fakeMessagesApi({ timeout: 90_000 });

    await provider.chat(messages, opts);

    expect(timeouts).toEqual(["90"]);
  });

  it("takes requestTimeoutMs, and a timeout in its client options over it", async () => {
    const { timeouts, fetch } = messagesApiFetch();
    const client = { apiKey: "test-key", maxRetries: 0, fetch };

    await createAnthropicProvider({ requestTimeoutMs: 5_000, client }).chat(messages, opts);
    await createAnthropicProvider({
      requestTimeoutMs: 5_000,
      client: { ...client, timeout: 90_000 },
    }).chat(messages, opts);

    expect(timeouts).toEqual(["5", "90"]);
  });
});

/**
 * A `fetch` that answers nothing, as a hung connection does, until its
 * request aborts. It keeps the X-Stainless-Retry-Count of each attempt.
 */
function hungFetch() {
  const retryCounts: (string | null)[] = [];
  const fetch = (_input: string | URL | Request, init?: RequestInit) => {
    retryCounts.push(new Headers(init?.headers).get("x-stainless-retry-count"));
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  };
  return { retryCounts, fetch: fetch as typeof globalThis.fetch };
}

describe("anthropic provider attempts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gives up on an endpoint that never answers after two attempts of 120 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // No jitter, so the SDK waits its full 500 ms before the retry.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { retryCounts, fetch } = hungFetch();
    const provider = createAnthropicProvider({ client: { apiKey: "test-key", fetch } });

    let outcome: unknown = "waiting";
    provider.chat(messages, opts).then(
      () => {
        outcome = "answered";
      },
      (error: unknown) => {
        outcome = error;
      },
    );

    await vi.advanceTimersByTimeAsync(120_000 + 500 + 120_000 - 1);
    expect(outcome).toBe("waiting");
    expect(retryCounts).toEqual(["0", "1"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBeInstanceOf(APIConnectionTimeoutError);
    expect(retryCounts).toEqual(["0", "1"]);
  });
});

describe("the registered anthropic provider", () => {
  /**
   * A registry over a fresh module graph, so the registered instance is new
   * and builds its SDK client over `fetch`, the global it finds then.
   */
  async function registryOver(fetch: typeof globalThis.fetch) {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetch);
    vi.resetModules();
    const { createProviderRegistry } = await import("../index.js");
    const fresh = await import("../logger.js");
    return {
      registry: createProviderRegistry({ defaultProvider: "anthropic" }),
      logger: fresh.logger,
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("says once across the registry's requests that it dropped a temperature", async () => {
    const { registry, logger: freshLogger } = await registryOver(messagesApiFetch().fetch);
    const debug = vi.spyOn(freshLogger, "debug");

    await registry.chat(messages, { temperature: 0.2 });
    await registry.chat(messages, { temperature: 0.2 });

    expect(
      debug.mock.calls.filter(([message]) => message === "anthropic sends no sampling options"),
    ).toEqual([["anthropic sends no sampling options", { temperature: 0.2, topP: undefined }]]);
  });

  it("keeps its circuit breaker open across the registry's requests", async () => {
    let requests = 0;
    const refusing = async () => {
      requests += 1;
      return Response.json(
        { type: "error", error: { type: "invalid_request_error", message: "refused" } },
        { status: 400 },
      );
    };
    const { registry } = await registryOver(refusing as typeof globalThis.fetch);

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(registry.chat(messages)).rejects.toThrow("refused");
    }
    await expect(registry.chat(messages)).rejects.toThrow("Circuit breaker is open");

    expect(requests).toBe(5);
  });
});
