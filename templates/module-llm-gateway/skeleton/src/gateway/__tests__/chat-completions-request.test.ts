import { APIConnectionTimeoutError as GroqTimeoutError } from "groq-sdk";
import { APIConnectionTimeoutError as OpenAITimeoutError } from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroqProvider } from "../providers/groq.js";
import { createOpenAIProvider } from "../providers/openai.js";
import type { GatewayProvider } from "../providers/types.js";
import type { ChatMessage, ChatOptions } from "../types.js";

// ── Chat Completions Request Tests ─────────────────────────────────
//
// The openai and groq providers both speak the Chat Completions API
// through an SDK client that applies a timeout to each attempt and
// retries one that times out. These hold each provider to the request it
// builds, to LLM_REQUEST_TIMEOUT_MS as the point at which its client
// abandons an attempt, and to the bound that and REQUEST_MAX_RETRIES put
// on a call to an endpoint that never answers. Each provider runs the real
// SDK client over an in-process `fetch`: one that answers with a JSON
// completion, so the assertions read the request the SDK put on the wire,
// or one that never answers, timed with fake timers. No request leaves the
// process.
//

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = { model: "test-model", maxTokens: 64, temperature: 0.2 };

const COMPLETION = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: "test-model",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello." },
      finish_reason: "stop",
      logprobs: null,
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
};

/** A `fetch` that answers as the Chat Completions API does. It keeps each request body. */
function completionsApiFetch() {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json(COMPLETION);
  };
  return { sent, fetch: fetch as typeof globalThis.fetch };
}

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

/** How `call` has settled so far: "waiting", "answered", or its error. */
function track(call: Promise<unknown>): { outcome: unknown } {
  const state: { outcome: unknown } = { outcome: "waiting" };
  call.then(
    () => {
      state.outcome = "answered";
    },
    (error: unknown) => {
      state.outcome = error;
    },
  );
  return state;
}

interface ClientSettings {
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
}

const PROVIDERS: {
  name: string;
  module: string;
  create: (client: ClientSettings) => GatewayProvider;
  TimeoutError: new (...args: never[]) => Error;
}[] = [
  {
    name: "openai",
    module: "../providers/openai.js",
    create: (client) => createOpenAIProvider({ client }),
    TimeoutError: OpenAITimeoutError,
  },
  {
    name: "groq",
    module: "../providers/groq.js",
    create: (client) => createGroqProvider({ client }),
    TimeoutError: GroqTimeoutError,
  },
];

describe.each(PROVIDERS)("$name provider request", ({ name, module, create, TimeoutError }) => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends the caller's temperature and reads the completion", async () => {
    const { sent, fetch } = completionsApiFetch();
    const provider = create({ apiKey: "test-key", fetch });

    const response = await provider.chat(messages, opts);

    expect(sent).toEqual([
      {
        model: "test-model",
        max_tokens: 64,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Answer briefly." },
          { role: "user", content: "Say hello." },
        ],
      },
    ]);
    expect(response).toMatchObject({
      text: "Hello.",
      model: "test-model",
      provider: name,
      inputTokens: 12,
      outputTokens: 3,
      cached: false,
    });
    expect(response.cost).toBeCloseTo(
      (12 * provider.pricing.input + 3 * provider.pricing.output) / 1_000_000,
    );
  });

  it("abandons an attempt at 30 seconds by default", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetch } = hungFetch();
    const provider = create({ apiKey: "test-key", fetch, maxRetries: 0 });

    const chat = track(provider.chat(messages, opts));

    await vi.advanceTimersByTimeAsync(29_999);
    expect(chat.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(TimeoutError);
  });

  it("takes LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import(module);
    const factory = name === "openai" ? fresh.createOpenAIProvider : fresh.createGroqProvider;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetch } = hungFetch();
    const provider: GatewayProvider = factory({
      client: { apiKey: "test-key", fetch, maxRetries: 0 },
    });

    const chat = track(provider.chat(messages, opts));

    await vi.advanceTimersByTimeAsync(4_999);
    expect(chat.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(Error);
    expect((chat.outcome as Error).message).toMatch(/timed out/i);
  });

  it("keeps a timeout and retry count the caller's client options set", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { retryCounts, fetch } = hungFetch();
    const provider = create({ apiKey: "test-key", fetch, timeout: 90_000, maxRetries: 0 });

    const chat = track(provider.chat(messages, opts));

    await vi.advanceTimersByTimeAsync(89_999);
    expect(chat.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(TimeoutError);
    expect(retryCounts).toEqual(["0"]);
  });

  it("gives up on an endpoint that never answers after two attempts of 30 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // No jitter, so the SDK waits its full 500 ms before the retry.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { retryCounts, fetch } = hungFetch();
    const provider = create({ apiKey: "test-key", fetch });

    const chat = track(provider.chat(messages, opts));

    await vi.advanceTimersByTimeAsync(30_000 + 500 + 30_000 - 1);
    expect(chat.outcome).toBe("waiting");
    expect(retryCounts).toEqual(["0", "1"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(TimeoutError);
    expect(retryCounts).toEqual(["0", "1"]);
  });
});
