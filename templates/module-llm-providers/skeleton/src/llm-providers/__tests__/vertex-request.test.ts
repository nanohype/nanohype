import type { GoogleGenAIOptions } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProvider } from "../providers/types.js";
import { createVertexProvider, type VertexProviderOptions } from "../providers/vertex.js";
import { RequestTimeoutError } from "../resilience/request-timeout.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";
import {
  CONTRACT_TIMEOUT_MS,
  describeProviderContract,
  endpointFetch,
} from "./provider-contract.js";

// ── Vertex Request Tests ───────────────────────────────────────────
//
// The vertex provider bounds a request by LLM_REQUEST_TIMEOUT_MS and a
// stream by each wait for its next event, aborts a request it gives up on,
// and refuses the SDK's own request timeout, whose timer outlives the
// call. These hold the provider to the request it builds in both request
// modes and the backend and API version it sends it to, to the usage a
// stream reports, to counting and pricing a thinking model's thoughts as
// output in both modes, to authenticating through its credentials, to refusing
// each client option that would send an API key or set the SDK's timeout,
// to giving up on and aborting either mode at LLM_REQUEST_TIMEOUT_MS, and
// to leaving no timer behind, and run it under the contract
// provider-contract.ts gives. The SDK sends its requests through the
// global `fetch`, which each test replaces with one that answers
// in-process, and its credentials come from an auth client that hands out
// a fixed token, so no request leaves the process.
//

type AuthClient = NonNullable<GoogleGenAIOptions["googleAuthOptions"]>["authClient"];
type VertexClientOptions = NonNullable<VertexProviderOptions["client"]>;

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = { model: "test-model", maxTokens: 64, temperature: 0.2, topP: 0.9 };

/** A thinking model the pricing table prices. */
const thinkingOpts: ChatOptions = { model: "gemini-2.5-pro", maxTokens: 64 };

const googleAuthOptions = {
  authClient: {
    getRequestHeaders: async () => new Headers({ authorization: "Bearer test-token" }),
  } as unknown as AuthClient,
};

const client = { project: "test-project", location: "us-central1", googleAuthOptions };

const REPLY = {
  candidates: [{ content: { role: "model", parts: [{ text: "Hello." }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
};

/**
 * The reply from a thinking model: 40 tokens of thoughts besides the 3 of
 * its candidate. `candidatesTokenCount` leaves the thoughts out, and Vertex
 * AI bills them at the output rate.
 */
const THINKING_REPLY = {
  ...REPLY,
  usageMetadata: {
    promptTokenCount: 12,
    candidatesTokenCount: 3,
    thoughtsTokenCount: 40,
    totalTokenCount: 55,
  },
};

/**
 * The reply from a thinking model that spent its output budget thinking: 64
 * tokens of thoughts, and no candidate tokens to report.
 */
const THOUGHTS_ONLY_REPLY = {
  candidates: [{ content: { role: "model", parts: [] }, finishReason: "MAX_TOKENS" }],
  usageMetadata: { promptTokenCount: 12, thoughtsTokenCount: 64, totalTokenCount: 76 },
};

/**
 * A thinking model's reply streamed in two events, each reporting usage as
 * the running total: the thoughts first, then the thoughts and the candidate.
 * The reply's output is the second report's 43 tokens, not the two summed.
 */
const STREAMED_THINKING_REPLY = [
  {
    candidates: [{ content: { role: "model", parts: [{ text: "Hel" }] } }],
    usageMetadata: { promptTokenCount: 12, thoughtsTokenCount: 40 },
  },
  {
    candidates: [{ content: { role: "model", parts: [{ text: "lo." }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 40 },
  },
];

/**
 * The reply streamed in three events, the first two reporting usage as the
 * running total @google/genai reads it as and the last reporting none: the
 * reply's usage is the second report, not the first, the two summed, or
 * nothing.
 */
const STREAMED_REPLY = [
  {
    candidates: [{ content: { role: "model", parts: [{ text: "Hel" }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1 },
  },
  {
    candidates: [{ content: { role: "model", parts: [{ text: "lo" }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
  },
  { candidates: [{ content: { role: "model", parts: [{ text: "." }] }, finishReason: "STOP" }] },
];

/**
 * A `fetch` that answers as the Vertex AI API does: with `reply` for a
 * request, and with `events` as server-sent events for a streamed request.
 * It keeps each request's URL, headers and body.
 */
function vertexApiFetch(events: object[] = [REPLY], reply: object = REPLY) {
  const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    if (url.includes(":streamGenerateContent")) {
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json(reply);
  };
  return { sent, fetch };
}

/**
 * A `fetch` that answers nothing, as a hung connection does, until its
 * request aborts. It counts the requests that abort.
 */
function hungFetch() {
  const state = { aborted: 0 };
  const fetch = (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        state.aborted += 1;
        reject(init.signal?.reason);
      });
    });
  return { state, fetch };
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the caller's sampling options to the v1 API and reads the reply", async () => {
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);

    const response = await createVertexProvider({ client }).chat(messages, opts);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toMatch(
      /\/v1\/projects\/test-project\/locations\/us-central1\/publishers\/google\/models\/test-model:generateContent$/,
    );
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

  it("sends temperature 1 and no topP when the caller sets neither", async () => {
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);

    await createVertexProvider({ client }).chat(messages, { model: "test-model" });

    expect(sent[0]?.body.generationConfig).toEqual({ maxOutputTokens: 4096, temperature: 1 });
  });

  it("sends to the API version client.apiVersion names", async () => {
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);

    const provider = createVertexProvider({ client: { ...client, apiVersion: "v1beta1" } });
    await provider.chat(messages, opts);

    expect(sent[0]?.url).toMatch(
      /\/v1beta1\/projects\/test-project\/locations\/us-central1\/publishers\/google\/models\/test-model:generateContent$/,
    );
  });

  it("streams the reply's text and its usage", async () => {
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);

    const stream = createVertexProvider({ client }).streamChat(messages, opts);

    expect(await drain(stream)).toBe("Hello.");
    expect(await stream.response).toMatchObject({
      text: "Hello.",
      provider: "vertex",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
    expect(sent[0]?.url).toMatch(
      /\/v1\/projects\/test-project\/.*:streamGenerateContent\?alt=sse$/,
    );
    expect(sent[0]?.body).toMatchObject({
      generationConfig: { maxOutputTokens: 64, temperature: 0.2, topP: 0.9 },
    });
  });

  it("reports the usage of the last streamed event that carries any", async () => {
    const { fetch } = vertexApiFetch(STREAMED_REPLY);
    vi.stubGlobal("fetch", fetch);

    const stream = createVertexProvider({ client }).streamChat(messages, opts);

    expect(await drain(stream)).toBe("Hello.");
    expect((await stream.response).usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it.each([
    ["a request", (provider: LlmProvider) => provider.chat(messages, thinkingOpts)],
    [
      "a stream",
      async (provider: LlmProvider) => {
        const stream = provider.streamChat(messages, thinkingOpts);
        await drain(stream);
        return stream.response;
      },
    ],
  ])(
    "counts a thinking model's thoughts as output tokens, and prices them, in %s",
    async (_mode, call) => {
      const { fetch } = vertexApiFetch([THINKING_REPLY], THINKING_REPLY);
      vi.stubGlobal("fetch", fetch);

      const response = await call(createVertexProvider({ client }));

      expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 43 });
      // gemini-2.5-pro: $1.25 per million input tokens, $10 per million output.
      expect(response.cost).toBeCloseTo((12 * 1.25 + 43 * 10) / 1_000_000, 12);
    },
  );

  it("counts the thoughts of a reply that reports no candidate tokens as its output", async () => {
    const { fetch } = vertexApiFetch([THOUGHTS_ONLY_REPLY], THOUGHTS_ONLY_REPLY);
    vi.stubGlobal("fetch", fetch);

    const response = await createVertexProvider({ client }).chat(messages, thinkingOpts);

    expect(response.text).toBe("");
    expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 64 });
  });

  it("reports a thinking stream's last usage, thoughts included, not each report summed", async () => {
    const { fetch } = vertexApiFetch(STREAMED_THINKING_REPLY);
    vi.stubGlobal("fetch", fetch);

    const stream = createVertexProvider({ client }).streamChat(messages, thinkingOpts);

    expect(await drain(stream)).toBe("Hello.");
    expect((await stream.response).usage).toEqual({ inputTokens: 12, outputTokens: 43 });
  });

  const fromOptions = {
    source: "its options",
    options: client,
    path: "/v1/projects/test-project/locations/us-central1/",
  };
  const fromEnvironment = {
    source: "the environment",
    options: { googleAuthOptions },
    path: "/v1/projects/env-project/locations/europe-west4/",
  };

  it.each([
    { key: "GOOGLE_API_KEY", ...fromOptions },
    { key: "GEMINI_API_KEY", ...fromOptions },
    { key: "GOOGLE_API_KEY", ...fromEnvironment },
    { key: "GEMINI_API_KEY", ...fromEnvironment },
  ])(
    "authenticates with its credentials, not $key, with the project and location from $source",
    async ({ key, options, path }) => {
      vi.stubEnv("GOOGLE_API_KEY", undefined);
      vi.stubEnv("GEMINI_API_KEY", undefined);
      vi.stubEnv(key, "test-api-key");
      vi.stubEnv("GOOGLE_CLOUD_PROJECT", "env-project");
      vi.stubEnv("GOOGLE_CLOUD_LOCATION", "europe-west4");
      // The SDK logs, at debug level, that the project and location win.
      vi.spyOn(console, "debug").mockImplementation(() => {});
      const { sent, fetch } = vertexApiFetch();
      vi.stubGlobal("fetch", fetch);

      await createVertexProvider({ client: options }).chat(messages, opts);

      expect(sent[0]?.url).toContain(path);
      expect(sent[0]?.headers.get("authorization")).toBe("Bearer test-token");
      expect(sent[0]?.headers.get("x-goog-api-key")).toBeNull();
    },
  );

  it("sends to Vertex AI, at the project and location it resolves, whatever backend flags client carries", async () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "env-project");
    vi.stubEnv("GOOGLE_CLOUD_LOCATION", undefined);
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);
    const geminiApi = {
      googleAuthOptions,
      enterprise: false,
      vertexai: false,
      project: undefined,
      location: undefined,
    } as VertexClientOptions;

    await createVertexProvider({ client: geminiApi }).chat(messages, opts);

    expect(sent[0]?.url).toMatch(
      /\/v1\/projects\/env-project\/locations\/us-central1\/publishers\/google\/models\/test-model:generateContent$/,
    );
    expect(sent[0]?.headers.get("authorization")).toBe("Bearer test-token");
  });

  it("sends the headers in client.httpOptions to its baseUrl", async () => {
    const { sent, fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);
    const httpOptions = { baseUrl: "https://vertex.example/", headers: { "x-test": "sent" } };

    await createVertexProvider({ client: { ...client, httpOptions } }).chat(messages, opts);

    expect(sent[0]?.url).toMatch(/^https:\/\/vertex\.example\/v1\/projects\/test-project\//);
    expect(sent[0]?.headers.get("x-test")).toBe("sent");
    expect(sent[0]?.headers.get("authorization")).toBe("Bearer test-token");
  });

  // The options' type leaves out each field these set, and the tests below
  // hold createVertexProvider() to refusing it from a JavaScript caller or a
  // cast.
  // @ts-expect-error `apiKey` is not a client option.
  const apiKeyClient: VertexClientOptions = { ...client, apiKey: "test-api-key" };
  const authApiKeyClient: VertexClientOptions = {
    ...client,
    // @ts-expect-error `googleAuthOptions.apiKey` is not a client option.
    googleAuthOptions: { apiKey: "test-api-key" },
  };
  // @ts-expect-error `httpOptions.timeout` is not a client option.
  const timeoutClient: VertexClientOptions = { ...client, httpOptions: { timeout: 1_000 } };

  it.each<[string, VertexClientOptions]>([
    ["client.apiKey", apiKeyClient],
    ["client.googleAuthOptions.apiKey", authApiKeyClient],
    [
      "client.googleAuthOptions.clientOptions.apiKey",
      { ...client, googleAuthOptions: { clientOptions: { apiKey: "test-api-key" } } },
    ],
    [
      "client.googleAuthOptions.authClient.apiKey",
      {
        ...client,
        googleAuthOptions: { authClient: { apiKey: "test-api-key" } as unknown as AuthClient },
      },
    ],
    [
      'client.httpOptions.headers["x-goog-api-key"]',
      { ...client, httpOptions: { headers: { "x-goog-api-key": "test-api-key" } } },
    ],
    [
      'client.httpOptions.headers["X-Goog-Api-Key"]',
      { ...client, httpOptions: { headers: { "X-Goog-Api-Key": "test-api-key" } } },
    ],
  ])("refuses an API key in %s", (field, keyed) => {
    expect(() => createVertexProvider({ client: keyed })).toThrow(`unset ${field}`);
  });

  it.each<[string, VertexClientOptions]>([
    [
      "client.httpOptions.baseUrl",
      { ...client, httpOptions: { baseUrl: "https://vertex.example/?key=test-api-key" } },
    ],
    ["client.apiVersion", { ...client, apiVersion: "v1?key=test-api-key" }],
    [
      "client.httpOptions.apiVersion",
      { ...client, httpOptions: { apiVersion: "v1?key=test-api-key" } },
    ],
    ["client.project", { ...client, project: "test-project?key=test-api-key" }],
    ["client.location", { ...client, location: "us-central1?key=test-api-key" }],
  ])("refuses a query string, which can carry an API key, in %s", (field, keyed) => {
    expect(() => createVertexProvider({ client: keyed })).toThrow(
      `vertex writes ${field} into its request URL`,
    );
  });

  it("refuses client.httpOptions.timeout", () => {
    expect(() => createVertexProvider({ client: timeoutClient })).toThrow(
      "unset client.httpOptions.timeout",
    );
  });

  it("gives up on and aborts a request at 120 seconds by default, in both request modes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hung = hungFetch();
    vi.stubGlobal("fetch", hung.fetch);
    const provider = createVertexProvider({ client });

    const chat = track(provider.chat(messages, opts));
    const stream = track(drain(provider.streamChat(messages, opts)));

    await vi.advanceTimersByTimeAsync(119_999);
    expect(chat.outcome).toBe("waiting");
    expect(stream.outcome).toBe("waiting");
    expect(hung.state.aborted).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(stream.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(hung.state.aborted).toBe(2);
  });

  it("leaves no timer running once a call returns", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetch } = vertexApiFetch();
    vi.stubGlobal("fetch", fetch);
    const provider = createVertexProvider({ client });

    await provider.chat(messages, opts);
    await drain(provider.streamChat(messages, opts));

    expect(vi.getTimerCount()).toBe(0);
  });
});

describeProviderContract("vertex", {
  create(behaviour) {
    const { endpoint, fetch } = endpointFetch(behaviour, {
      firstEvent: `data: ${JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text: "Hel" }] } }],
      })}\n\n`,
      refusal: { error: { code: 400, message: "refused", status: "INVALID_ARGUMENT" } },
    });
    vi.stubGlobal("fetch", fetch);
    return {
      endpoint,
      provider: createVertexProvider({ requestTimeoutMs: CONTRACT_TIMEOUT_MS, client }),
    };
  },
  ChatTimeoutError: RequestTimeoutError,
});
