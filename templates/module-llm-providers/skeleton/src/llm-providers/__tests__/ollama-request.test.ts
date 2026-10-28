import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider } from "../providers/ollama.js";
import type { LlmProvider } from "../providers/types.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";

// ── Ollama Request Tests ───────────────────────────────────────────
//
// The ollama provider calls the server's chat-completions endpoint with
// the global `fetch`, bounding each call with an abort signal that fires
// at LLM_REQUEST_TIMEOUT_MS. These hold the provider to the request it
// builds in both request modes and to abandoning either one at that
// timeout. Each test replaces the global `fetch` with one that answers
// in-process, so no request leaves the process. The timeout tests load the
// provider under a 50 ms setting and run on real timers, because fake
// timers do not drive AbortSignal.timeout.
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

/** A `fetch` that answers nothing, as a hung connection does, until its request aborts. */
function hungFetch(_input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

/** How `call` settles within `ms`: "answered", its error, or "waiting". */
async function settleWithin(call: Promise<unknown>, ms: number): Promise<unknown> {
  const waiting = new Promise((resolve) => setTimeout(() => resolve("waiting"), ms));
  return Promise.race([
    call.then(
      () => "answered",
      (error: unknown) => error,
    ),
    waiting,
  ]);
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

  it("abandons a request at LLM_REQUEST_TIMEOUT_MS, in both request modes", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "50");
    vi.resetModules();
    const fresh = await import("../providers/ollama.js");
    const provider: LlmProvider = fresh.createOllamaProvider();
    vi.stubGlobal("fetch", hungFetch);

    const chat = provider.chat(messages, opts);
    const stream = drain(provider.streamChat(messages, opts));

    expect(await settleWithin(chat, 2_000)).toBeInstanceOf(Error);
    expect(await settleWithin(stream, 2_000)).toBeInstanceOf(Error);
  });
});
