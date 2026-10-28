import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider, DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS } from "../providers/ollama.js";
import type { LlmProvider } from "../providers/types.js";
import { RequestTimeoutError } from "../resilience/request-timeout.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";
import {
  CONTRACT_TIMEOUT_MS,
  describeProviderContract,
  endpointFetch,
} from "./provider-contract.js";

// ── Ollama Request Tests ───────────────────────────────────────────
//
// The ollama provider calls the server's chat-completions endpoint with
// the global `fetch`, bounding a request by OLLAMA_REQUEST_TIMEOUT_MS and a
// stream by each wait for its next event, and aborting the request's
// signal when it gives up. These hold the provider to the request it
// builds in both request modes, to giving up on either one at that
// timeout, and to reading its own setting rather than
// LLM_REQUEST_TIMEOUT_MS, and run it under the breaker and timeout
// contract provider-contract.ts gives. Each test replaces the global
// `fetch` with one
// that answers in-process, so no request leaves the process, and the
// timeout tests run on fake timers.
//

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = { model: "test-model", maxTokens: 64, temperature: 0.2, topP: 0.9 };

const COMPLETION = {
  choices: [{ message: { role: "assistant", content: "Hello." } }],
  usage: { prompt_tokens: 12, completion_tokens: 3 },
};

const CHUNK = { choices: [{ delta: { content: "Hello." } }] };

/**
 * A `fetch` that answers as Ollama's chat-completions endpoint does,
 * streamed when asked. It keeps each request's URL and body.
 */
function ollamaApiFetch() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ url: String(input), body });
    if (body.stream) {
      return new Response(`data: ${JSON.stringify(CHUNK)}\n\ndata: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json(COMPLETION);
  };
  return { sent, fetch };
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
  return { aborted, fetch };
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

describe("ollama provider request", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the caller's sampling options to OLLAMA_BASE_URL and reads the completion", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.test:11434/v1/");
    const { sent, fetch } = ollamaApiFetch();
    vi.stubGlobal("fetch", fetch);

    const response = await createOllamaProvider().chat(messages, opts);

    expect(sent).toEqual([
      {
        url: "http://ollama.test:11434/v1/chat/completions",
        body: {
          model: "test-model",
          max_tokens: 64,
          temperature: 0.2,
          messages: [
            { role: "system", content: "Answer briefly." },
            { role: "user", content: "Say hello." },
          ],
          top_p: 0.9,
        },
      },
    ]);
    expect(response).toMatchObject({
      text: "Hello.",
      model: "test-model",
      provider: "ollama",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("streams the completion's text", async () => {
    const { sent, fetch } = ollamaApiFetch();
    vi.stubGlobal("fetch", fetch);

    const stream = createOllamaProvider().streamChat(messages, opts);

    expect(await drain(stream)).toBe("Hello.");
    expect(await stream.response).toMatchObject({ text: "Hello.", provider: "ollama" });
    expect(sent[0]?.body).toMatchObject({ stream: true, temperature: 0.2, top_p: 0.9 });
  });

  it("gives up on a request at 600 seconds by default, in both request modes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, fetch } = hungFetch();
    vi.stubGlobal("fetch", fetch);
    const provider = createOllamaProvider();

    const chat = track(provider.chat(messages, opts));
    const stream = track(drain(provider.streamChat(messages, opts)));

    expect(DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS).toBe(600_000);
    await vi.advanceTimersByTimeAsync(599_999);
    expect(chat.outcome).toBe("waiting");
    expect(stream.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(stream.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(aborted).toEqual([true, true]);
  });

  it("takes OLLAMA_REQUEST_TIMEOUT_MS, not LLM_REQUEST_TIMEOUT_MS, as its module loads", async () => {
    vi.stubEnv("OLLAMA_REQUEST_TIMEOUT_MS", "5000");
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "1000");
    vi.resetModules();
    const fresh = await import("../providers/ollama.js");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", hungFetch().fetch);
    const provider: LlmProvider = fresh.createOllamaProvider();

    const chat = track(provider.chat(messages, opts));

    await vi.advanceTimersByTimeAsync(4_999);
    expect(chat.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toMatchObject({ name: "RequestTimeoutError", timeoutMs: 5_000 });
  });

  it("fails its import on an OLLAMA_REQUEST_TIMEOUT_MS the parse refuses", async () => {
    vi.stubEnv("OLLAMA_REQUEST_TIMEOUT_MS", "10m");
    vi.resetModules();

    await expect(import("../providers/ollama.js")).rejects.toThrow(
      'OLLAMA_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "10m"',
    );
  });
});

describeProviderContract("ollama", {
  create(behaviour) {
    const { endpoint, fetch } = endpointFetch(behaviour, {
      firstEvent: `data: ${JSON.stringify(CHUNK)}\n\n`,
      refusal: { error: "refused" },
    });
    vi.stubGlobal("fetch", fetch);
    return { endpoint, provider: createOllamaProvider({ requestTimeoutMs: CONTRACT_TIMEOUT_MS }) };
  },
  ChatTimeoutError: RequestTimeoutError,
  dropsConnection: true,
});
