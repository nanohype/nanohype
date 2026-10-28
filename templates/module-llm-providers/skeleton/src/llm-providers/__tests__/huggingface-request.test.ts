import { afterEach, describe, expect, it, vi } from "vitest";
import { createHuggingFaceProvider } from "../providers/huggingface.js";
import type { LlmProvider } from "../providers/types.js";
import { RequestTimeoutError } from "../resilience/request-timeout.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";
import {
  CONTRACT_TIMEOUT_MS,
  describeProviderContract,
  endpointFetch,
} from "./provider-contract.js";

// ── Hugging Face Request Tests ─────────────────────────────────────
//
// The huggingface provider bounds a request by LLM_REQUEST_TIMEOUT_MS and
// a stream by each wait for its next event, aborting the request's signal
// when it gives up. These hold the provider to the request it builds in
// both request modes and to giving up on either one at that timeout, and
// run it under the breaker and timeout contract provider-contract.ts
// gives. The provider runs the real SDK client over a `fetch` that
// answers in-process, so no request leaves the process, and the timeout
// tests run on fake timers.
//

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = { model: "test-model", maxTokens: 64, temperature: 0.2, topP: 0.9 };

/** The SDK accepts only an access token in the Hugging Face format. */
const accessToken = "hf_test";

const COMPLETION = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: "test-model",
  system_fingerprint: null,
  choices: [{ index: 0, message: { role: "assistant", content: "Hello." }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
};

const CHUNK = {
  id: "chatcmpl-test",
  object: "chat.completion.chunk",
  created: 0,
  model: "test-model",
  choices: [{ index: 0, delta: { content: "Hello." }, finish_reason: null }],
};

/**
 * A `fetch` that answers as a chat-completions endpoint does, streamed
 * when asked. It keeps each request body.
 */
function completionsApiFetch() {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push(body);
    if (body.stream) {
      return new Response(`data: ${JSON.stringify(CHUNK)}\n\ndata: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json(COMPLETION);
  };
  return { sent, fetch: fetch as typeof globalThis.fetch };
}

/**
 * A `fetch` that answers nothing, as a hung connection does, until its
 * request aborts. It keeps whether each request's signal fired.
 */
function hungFetch() {
  const aborted: boolean[] = [];
  const fetch = (_input: string | URL | Request, init?: RequestInit) => {
    const index = aborted.push(false) - 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted[index] = true;
        reject(init.signal?.reason);
      });
    });
  };
  return { aborted, fetch: fetch as typeof globalThis.fetch };
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

async function drain(response: StreamResponse): Promise<string> {
  const text: string[] = [];
  for await (const chunk of response) {
    text.push(chunk.text);
  }
  return text.join("");
}

describe("huggingface provider request", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("sends the caller's sampling options and reads the completion", async () => {
    const { sent, fetch } = completionsApiFetch();
    const provider = createHuggingFaceProvider({ accessToken, client: { fetch } });

    const response = await provider.chat(messages, opts);

    expect(sent[0]).toMatchObject({
      model: "test-model",
      max_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
      messages: [
        { role: "system", content: "Answer briefly." },
        { role: "user", content: "Say hello." },
      ],
    });
    expect(response).toMatchObject({
      text: "Hello.",
      model: "test-model",
      provider: "huggingface",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("streams the completion's text", async () => {
    const { sent, fetch } = completionsApiFetch();
    const provider = createHuggingFaceProvider({ accessToken, client: { fetch } });

    const stream = provider.streamChat(messages, opts);

    expect(await drain(stream)).toBe("Hello.");
    expect(await stream.response).toMatchObject({ text: "Hello.", provider: "huggingface" });
    expect(sent[0]).toMatchObject({ stream: true, temperature: 0.2, top_p: 0.9 });
  });

  it("gives up on a request at 120 seconds by default, in both request modes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, fetch } = hungFetch();
    const provider = createHuggingFaceProvider({ accessToken, client: { fetch } });

    const chat = track(provider.chat(messages, opts));
    const stream = track(drain(provider.streamChat(messages, opts)));

    await vi.advanceTimersByTimeAsync(119_999);
    expect(chat.outcome).toBe("waiting");
    expect(stream.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(stream.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(aborted).toEqual([true, true]);
  });

  it("takes LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import("../providers/huggingface.js");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetch } = hungFetch();
    const provider: LlmProvider = fresh.createHuggingFaceProvider({
      accessToken,
      client: { fetch },
    });

    const chat = track(provider.chat(messages, opts));

    await vi.advanceTimersByTimeAsync(4_999);
    expect(chat.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toMatchObject({ name: "RequestTimeoutError", timeoutMs: 5_000 });
  });
});

describeProviderContract("huggingface", {
  create(behaviour) {
    const { endpoint, fetch } = endpointFetch(behaviour, {
      firstEvent: `data: ${JSON.stringify({ ...CHUNK, choices: [{ ...CHUNK.choices[0], delta: { content: "Hel" } }] })}\n\n`,
      refusal: { error: "refused" },
    });
    const provider = createHuggingFaceProvider({
      accessToken,
      requestTimeoutMs: CONTRACT_TIMEOUT_MS,
      client: { fetch },
    });
    return { endpoint, provider };
  },
  ChatTimeoutError: RequestTimeoutError,
  dropsConnection: true,
});
