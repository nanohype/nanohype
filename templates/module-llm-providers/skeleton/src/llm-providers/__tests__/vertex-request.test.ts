import type { VertexInit } from "@google-cloud/vertexai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVertexProvider } from "../providers/vertex.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";

// ── Vertex Request Tests ───────────────────────────────────────────
//
// The vertex provider passes LLM_REQUEST_TIMEOUT_MS to the SDK as its
// request timeout, which aborts a request still unanswered when it fires.
// These hold the provider to the request it builds in both request modes
// and to abandoning either one at that timeout. The Vertex AI SDK sends
// its requests through the global `fetch`, which each test replaces with
// one that answers in-process, and its credentials come from an auth
// client that hands out a fixed token, so no request leaves the process.
//

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = { model: "test-model", maxTokens: 64, temperature: 0.2, topP: 0.9 };

const client: VertexInit = {
  project: "test-project",
  location: "us-central1",
  googleAuthOptions: {
    authClient: { getAccessToken: async () => ({ token: "test-token" }) },
  } as unknown as VertexInit["googleAuthOptions"],
};

const REPLY = {
  candidates: [{ content: { role: "model", parts: [{ text: "Hello." }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
};

/**
 * A `fetch` that answers as the Vertex AI API does, with server-sent
 * events for a streamed request. It keeps each request's URL and body.
 */
function vertexApiFetch() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    if (url.includes(":streamGenerateContent")) {
      return new Response(`data: ${JSON.stringify(REPLY)}\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json(REPLY);
  };
  return { sent, fetch };
}

/** A `fetch` that answers nothing, as a hung connection does, until its request aborts. */
function hungFetch(_input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
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

describe("vertex provider request", () => {
  beforeEach(() => {
    // The SDK warns of its deprecation as each client is built.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the caller's sampling options and reads the reply", async () => {
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);

    const response = await createVertexProvider({ client }).chat(messages, opts);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toMatch(/\/models\/test-model:generateContent$/);
    expect(sent[0]?.body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Say hello." }] }],
      systemInstruction: { parts: [{ text: "Answer briefly." }] },
      generationConfig: { maxOutputTokens: 64, temperature: 0.2, topP: 0.9 },
    });
    expect(response).toMatchObject({
      text: "Hello.",
      model: "test-model",
      provider: "vertex",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("streams the reply's text", async () => {
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);

    const stream = createVertexProvider({ client }).streamChat(messages, opts);

    expect(await drain(stream)).toBe("Hello.");
    expect(await stream.response).toMatchObject({ text: "Hello.", provider: "vertex" });
    expect(sent[0]?.url).toMatch(/:streamGenerateContent\?alt=sse$/);
  });

  it("abandons a request at 30 seconds by default, in both request modes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", hungFetch);
    const provider = createVertexProvider({ client });

    const chat = track(provider.chat(messages, opts));
    const stream = track(drain(provider.streamChat(messages, opts)));

    await vi.advanceTimersByTimeAsync(29_999);
    expect(chat.outcome).toBe("waiting");
    expect(stream.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(Error);
    expect(stream.outcome).toBeInstanceOf(Error);
  });
});
