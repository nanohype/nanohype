import { afterEach, describe, expect, it, vi } from "vitest";
import { createHuggingFaceProvider } from "../providers/huggingface.js";
import type { LlmProvider } from "../providers/types.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";

// ── Hugging Face Request Tests ─────────────────────────────────────
//
// The huggingface provider bounds each call with an abort signal that
// fires at LLM_REQUEST_TIMEOUT_MS. These hold the provider to the request
// it builds in both request modes and to abandoning either one at that
// timeout. The provider runs the real SDK client over a `fetch` that
// answers in-process, so no request leaves the process. The timeout tests
// load the provider under a 50 ms setting and run on real timers, because
// fake timers do not drive AbortSignal.timeout.
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

/** A `fetch` that answers nothing, as a hung connection does, until its request aborts. */
const hungFetch = ((_input: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof globalThis.fetch;

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

describe("huggingface provider request", () => {
  afterEach(() => {
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

  it("abandons a request at LLM_REQUEST_TIMEOUT_MS, in both request modes", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "50");
    vi.resetModules();
    const fresh = await import("../providers/huggingface.js");
    const provider: LlmProvider = fresh.createHuggingFaceProvider({
      accessToken,
      client: { fetch: hungFetch },
    });

    const chat = provider.chat(messages, opts);
    const stream = drain(provider.streamChat(messages, opts));

    expect(await settleWithin(chat, 2_000)).toBeInstanceOf(Error);
    expect(await settleWithin(stream, 2_000)).toBeInstanceOf(Error);
  });
});
