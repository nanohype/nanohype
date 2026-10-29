import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  createGatewayProvider,
  DEFAULT_MODEL_GATEWAY_ENDPOINT,
  DEFAULT_MODEL_ROUTE,
  DEFAULT_ROUTE_MODEL,
  MAX_ATTEMPTS,
  MESSAGES_PATH,
  ModelGatewayError,
  parseGatewayEndpoint,
  retryDelayMs,
} from "../providers/gateway.js";
import { RequestTimeoutError } from "../resilience/request-timeout.js";
import {
  type ChatMessage,
  type ChatOptions,
  DEFAULT_PRICING,
  type StreamResponse,
} from "../types.js";
import {
  CONTRACT_TIMEOUT_MS,
  describeProviderContract,
  endpointFetch,
} from "./provider-contract.js";

// ── Gateway Request Tests ──────────────────────────────────────────
//
// The gateway provider calls the Platform's ModelGateway with the global
// `fetch`, speaking native Anthropic Messages under the gateway's
// /anthropic prefix, and carries no credential. These run it against an
// HTTP server listening in-process on the loopback interface, so each
// assertion reads the request as the gateway would receive it, headers
// included, and no request leaves the machine. They hold the provider to
// the path and body it sends in both request modes, to sending no
// credential even when provider keys sit in the environment, to reading
// the reply and its usage, to failing on a refusal, an error event or a
// stream cut short, and to the endpoint and route settings it reads as
// its module loads. The breaker and timeout contract provider-contract.ts
// gives runs over an in-process `fetch`, on fake timers.
//

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = { maxTokens: 64, temperature: 0.2, topP: 0.9, stop: ["\n\n"] };

const MESSAGE = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "us.anthropic.claude-sonnet-5",
  content: [{ type: "text", text: "Hello." }],
  stop_reason: "end_turn",
  usage: {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_read_input_tokens: 40,
    cache_creation_input_tokens: 8,
  },
};

/** The server-sent events of one streamed message whose text arrives as `parts`. */
function messageEvents(parts: string[], { stop = true } = {}): string {
  const events: unknown[] = [
    {
      type: "message_start",
      message: {
        ...MESSAGE,
        content: [],
        usage: { input_tokens: 12, output_tokens: 1, cache_read_input_tokens: 4 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "ping" },
    ...parts.map((text) => ({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    })),
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 3, cache_read_input_tokens: null },
    },
    ...(stop ? [{ type: "message_stop" }] : []),
  ];
  return events
    .map((data) => `event: ${(data as { type: string }).type}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

/**
 * An HTTP server on the loopback interface that answers each request with
 * `answer`, keeping what it received.
 */
async function gatewayServer(answer: (req: Received, res: ServerResponse) => void) {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const request = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      };
      received.push(request);
      answer(request, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  servers.push(server);
  return { endpoint: `http://127.0.0.1:${port}`, received };
}

const servers: ReturnType<typeof createServer>[] = [];

/** A server that answers as the gateway's Messages endpoint does, streamed when asked. */
function messagesGateway(reply: typeof MESSAGE = MESSAGE) {
  return gatewayServer((req, res) => {
    if (req.body.stream === true) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(messageEvents(["Hel", "lo."]));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply));
  });
}

async function drain(response: StreamResponse): Promise<string> {
  const text: string[] = [];
  for await (const chunk of response) {
    text.push(chunk.text);
  }
  return text.join("");
}

/** The headers that would carry a credential, as a gateway would receive them. */
function credentialHeaders(headers: IncomingHttpHeaders): string[] {
  return Object.keys(headers).filter((name) =>
    /^(authorization|proxy-authorization|x-api-key|api-key|cookie|x-amz-.*)$/i.test(name),
  );
}

describe("gateway provider request", () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("sends a Messages request naming the route, with no credential, to the /anthropic prefix", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token-must-not-leave");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    const { endpoint, received } = await messagesGateway();

    await createGatewayProvider({ endpoint }).chat(messages, opts);

    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(MESSAGES_PATH);
    expect(MESSAGES_PATH).toBe("/anthropic/v1/messages");
    expect(credentialHeaders(request?.headers ?? {})).toEqual([]);
    expect(JSON.stringify(request)).not.toMatch(/must-not-leave/);
    expect(request?.headers["content-type"]).toBe("application/json");
    expect(request?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(request?.body).toEqual({
      model: DEFAULT_MODEL_ROUTE,
      max_tokens: 64,
      system: [{ type: "text", text: "Answer briefly.", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Say hello." }],
      stop_sequences: ["\n\n"],
    });
  });

  it("reads the reply's text, model, usage and cache tokens", async () => {
    const { endpoint } = await messagesGateway();

    const response = await createGatewayProvider({ endpoint }).chat(messages, opts);

    expect(response).toMatchObject({
      text: "Hello.",
      model: "us.anthropic.claude-sonnet-5",
      provider: "gateway",
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 40,
        cacheWriteTokens: 8,
      },
    });
    // claude-sonnet-5 at 3 and 15 per million: the model the reply names
    // prices it, not the route the request named.
    expect(response.cost).toBeCloseTo(18);
  });

  it("prices a reply naming a versioned inference profile at its model's rate", async () => {
    const { endpoint } = await messagesGateway({
      ...MESSAGE,
      model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    });

    const response = await createGatewayProvider({ endpoint }).chat(messages, opts);

    // claude-haiku-4-5 at 1 and 5 per million.
    expect(response.cost).toBeCloseTo(6);
  });

  it("declares the rate of DEFAULT_ROUTE_MODEL, and bills a reply naming the route at it", async () => {
    const { endpoint } = await messagesGateway({ ...MESSAGE, model: DEFAULT_MODEL_ROUTE });
    const provider = createGatewayProvider({ endpoint });

    const response = await provider.chat(messages, opts);

    expect(DEFAULT_ROUTE_MODEL).toBe("claude-sonnet-5");
    expect(provider.pricing).toEqual(DEFAULT_PRICING[DEFAULT_ROUTE_MODEL]);
    // The route is no model the table lists: the declared 3 and 15 per million bill it.
    expect(response.model).toBe("default");
    expect(response.cost).toBeCloseTo(18);
  });

  it("declares the `pricing` option's rate and bills an unlisted model at it, a listed one at its own", async () => {
    const pricing = { input: 2, output: 4 };
    const unlisted = await messagesGateway({ ...MESSAGE, model: "us.example.unlisted-model-v1:0" });
    const listed = await messagesGateway();

    const provider = createGatewayProvider({ endpoint: unlisted.endpoint, pricing });
    const fromUnlisted = await provider.chat(messages, opts);
    const fromListed = await createGatewayProvider({ endpoint: listed.endpoint, pricing }).chat(
      messages,
      opts,
    );

    expect(provider.pricing).toEqual(pricing);
    expect(fromUnlisted.cost).toBeCloseTo(6);
    // claude-sonnet-5 at 3 and 15 per million, over the declared rate.
    expect(fromListed.cost).toBeCloseTo(18);
  });

  it("bills a stream whose events name no model at the declared rate", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(messageEvents(["Hi."]).replaceAll(`"model":"${MESSAGE.model}",`, ""));
    });

    const stream = createGatewayProvider({
      endpoint,
      route: "classify",
      pricing: { input: 1_000_000, output: 2_000_000 },
    }).streamChat(messages);

    expect(await drain(stream)).toBe("Hi.");
    const response = await stream.response;
    expect(response.model).toBe("classify");
    // 12 input tokens at 1 per token and 3 output tokens at 2 per token.
    expect(response.cost).toBeCloseTo(18);
  });

  it("names opts.model as the route, then the instance's route, and leaves out an absent system prompt", async () => {
    const { endpoint, received } = await messagesGateway();
    const provider = createGatewayProvider({ endpoint, route: "classify" });

    await provider.chat([{ role: "user", content: "Hi." }], { model: "escalation" });
    await provider.chat([{ role: "user", content: "Hi." }]);

    expect(received.map((r) => r.body.model)).toEqual(["escalation", "classify"]);
    expect(received[1]?.body).toEqual({
      model: "classify",
      max_tokens: 4096,
      messages: [{ role: "user", content: "Hi." }],
    });
  });

  it("streams the reply's text and reads usage from message_start and message_delta", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    const { endpoint, received } = await messagesGateway();

    const stream = createGatewayProvider({ endpoint }).streamChat(messages, opts);

    expect(await drain(stream)).toBe("Hello.");
    expect(await stream.response).toMatchObject({
      text: "Hello.",
      model: "us.anthropic.claude-sonnet-5",
      provider: "gateway",
      usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 4 },
    });
    expect(received[0]?.url).toBe(MESSAGES_PATH);
    expect(credentialHeaders(received[0]?.headers ?? {})).toEqual([]);
    expect(received[0]?.body).toMatchObject({ model: DEFAULT_MODEL_ROUTE, stream: true });
    expect(received[0]?.body).not.toHaveProperty("temperature");
    expect(received[0]?.body).not.toHaveProperty("top_p");
  });

  it("fails a refused request with the gateway's status and message", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "0" });
      res.end(
        JSON.stringify({
          type: "error",
          error: { type: "rate_limit_error", message: "route default is over its limit" },
        }),
      );
    });

    const failure = createGatewayProvider({ endpoint }).chat(messages, opts);

    await expect(failure).rejects.toBeInstanceOf(ModelGatewayError);
    await expect(failure).rejects.toMatchObject({
      status: 429,
      message: "Model gateway answered 429: route default is over its limit",
    });
  });

  it("fails a request Envoy refuses in plain text, and a stream it refuses", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("no healthy upstream");
    });
    const provider = createGatewayProvider({ endpoint });

    await expect(provider.chat(messages)).rejects.toMatchObject({
      status: 503,
      message: "Model gateway answered 503: no healthy upstream",
    });
    const stream = provider.streamChat(messages);
    await expect(drain(stream)).rejects.toMatchObject({ status: 503 });
    await expect(stream.response).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it("fails a 200 whose body is not a Messages reply, with the schema's error", async () => {
    for (const reply of [
      { ...MESSAGE, content: [{ type: "text", text: 42 }] },
      { ...MESSAGE, content: "Hello." },
      { ...MESSAGE, content: [{ text: "Hello." }] },
    ]) {
      const { endpoint } = await gatewayServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(reply));
      });

      await expect(createGatewayProvider({ endpoint }).chat(messages)).rejects.toBeInstanceOf(
        ZodError,
      );
    }
  });

  it("fails a stream that reports an error event", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        `${messageEvents(["Hel"]).split("event: content_block_stop")[0]}event: error\ndata: ${JSON.stringify(
          { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
        )}\n\n`,
      );
    });

    const stream = createGatewayProvider({ endpoint }).streamChat(messages);

    await expect(drain(stream)).rejects.toThrow("Model gateway stream failed: Overloaded");
    await expect(stream.response).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it("fails a stream that ends before message_stop, and one carrying an unreadable event", async () => {
    let call = 0;
    const { endpoint } = await gatewayServer((_req, res) => {
      call += 1;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        call === 1
          ? messageEvents(["Hel", "lo."], { stop: false })
          : `event: message_start\ndata: {"type":\n\n`,
      );
    });
    const provider = createGatewayProvider({ endpoint });

    await expect(drain(provider.streamChat(messages))).rejects.toThrow(
      "Model gateway stream ended before message_stop",
    );
    await expect(drain(provider.streamChat(messages))).rejects.toThrow(
      "Model gateway sent an unreadable stream event",
    );
  });

  it("reads MODEL_GATEWAY_ENDPOINT and MODEL_ROUTE as its module loads", async () => {
    const { endpoint, received } = await messagesGateway();
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", `${endpoint}/`);
    vi.stubEnv("MODEL_ROUTE", "summaries");
    vi.resetModules();
    const fresh = await import("../providers/gateway.js");

    await fresh.createGatewayProvider().chat(messages);

    expect(fresh.MODEL_GATEWAY_ENDPOINT).toBe(endpoint);
    expect(received[0]?.url).toBe(MESSAGES_PATH);
    expect(received[0]?.body.model).toBe("summaries");
  });

  it("defaults to the Service the operator creates for the Platform, and the default route", async () => {
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", "");
    vi.stubEnv("MODEL_ROUTE", "");
    vi.resetModules();
    const fresh = await import("../providers/gateway.js");

    expect(fresh.MODEL_GATEWAY_ENDPOINT).toBe(DEFAULT_MODEL_GATEWAY_ENDPOINT);
    expect(fresh.MODEL_ROUTE).toBe("default");
    // <platform>-gateway in tenants-<platform>, on the gateway's 8080 listener.
    expect(DEFAULT_MODEL_GATEWAY_ENDPOINT).toMatch(
      /^http:\/\/([a-z_][a-z0-9_-]*)-gateway\.tenants-\1\.svc\.cluster\.local:8080$/i,
    );
  });

  it("fails its import on a MODEL_GATEWAY_ENDPOINT that is not a gateway root", async () => {
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", "http://app-gateway.tenants-app.svc:8080/anthropic");
    vi.resetModules();

    await expect(import("../providers/gateway.js")).rejects.toThrow(
      'MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway status.endpoint publishes it, and takes no path, query or fragment, got "http://app-gateway.tenants-app.svc:8080/anthropic"',
    );
  });

  it("takes an http or https root and refuses anything else", () => {
    expect(parseGatewayEndpoint("https://gw.example:8443")).toBe("https://gw.example:8443");
    expect(parseGatewayEndpoint("http://gw:8080/")).toBe("http://gw:8080");
    expect(parseGatewayEndpoint(undefined)).toBe(DEFAULT_MODEL_GATEWAY_ENDPOINT);
    expect(() => parseGatewayEndpoint("gw:8080")).toThrow(
      'MODEL_GATEWAY_ENDPOINT must be an http or https URL, got "gw:8080"',
    );
    expect(() => parseGatewayEndpoint("not a url")).toThrow("must be an http or https URL");
    expect(() => parseGatewayEndpoint("http://gw:8080/?route=x")).toThrow("takes no path");
  });

  it("gives up on a request at LLM_REQUEST_TIMEOUT_MS, read as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import("../providers/gateway.js");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { endpoint, fetch } = endpointFetch("stalls", { firstEvent: "", refusal: {} });
    const chat = fresh
      .createGatewayProvider({ endpoint: "http://gw:8080", fetch })
      .chat(messages)
      .catch((error: unknown) => error);

    while (endpoint.requests === 0) await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await chat).toMatchObject({ name: "RequestTimeoutError", timeoutMs: 5_000 });
    expect(endpoint.aborted).toBe(true);
  });
});

describeProviderContract("gateway", {
  create(behaviour) {
    const { endpoint, fetch } = endpointFetch(behaviour, {
      firstEvent: `event: message_start\ndata: ${JSON.stringify({
        type: "message_start",
        message: { ...MESSAGE, content: [], usage: { input_tokens: 12, output_tokens: 0 } },
      })}\n\n`,
      // A 4xx answers for the request and leaves the gateway provider's
      // breaker closed; a 5xx is the refusal its breaker counts.
      refusal: { type: "error", error: { type: "api_error", message: "refused" } },
      refusalStatus: 503,
    });
    const provider = createGatewayProvider({
      endpoint: "http://gw.test:8080",
      fetch,
      requestTimeoutMs: CONTRACT_TIMEOUT_MS,
    });
    return { endpoint, provider };
  },
  ChatTimeoutError: RequestTimeoutError,
});

describe("a request the route's rate limit refuses", () => {
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  const LIMITED = {
    type: "error",
    error: { type: "rate_limit_error", message: "route default is over its limit" },
  };

  /**
   * A server that answers its first `limited` requests with `status`,
   * carrying `headers`, and answers as the gateway does after them.
   */
  function limitedGateway(
    limited: number,
    { status = 429, headers = { "retry-after": "0" } as Record<string, string> } = {},
  ) {
    let seen = 0;
    return gatewayServer((req, res) => {
      if (seen++ < limited) {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(LIMITED));
        return;
      }
      if (req.body.stream === true) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(messageEvents(["Hel", "lo."]));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(MESSAGE));
    });
  }

  /** One call through a client of its own, as the template makes it. */
  function caller(endpoint: string, requestTimeoutMs?: number): () => Promise<unknown> {
    const provider = createGatewayProvider({ endpoint, requestTimeoutMs });
    return () => provider.chat([{ role: "user", content: "Hi." }]);
  }

  it("is sent again after the wait Retry-After asks for, up to MAX_ATTEMPTS sends", async () => {
    const { endpoint, received } = await limitedGateway(MAX_ATTEMPTS - 1);

    await expect(caller(endpoint)()).resolves.toBeDefined();

    expect(MAX_ATTEMPTS).toBe(3);
    expect(received).toHaveLength(MAX_ATTEMPTS);
    expect(new Set(received.map((r) => JSON.stringify(r.body))).size).toBe(1);
  });

  it("fails with the last 429 once MAX_ATTEMPTS sends are refused", async () => {
    const { endpoint, received } = await limitedGateway(Number.POSITIVE_INFINITY);

    await expect(caller(endpoint)()).rejects.toMatchObject({
      name: "ModelGatewayError",
      status: 429,
      message: "Model gateway answered 429: route default is over its limit",
    });
    expect(received).toHaveLength(MAX_ATTEMPTS);
  });

  it("fails at once when the wait Retry-After asks for ends past the timeout", async () => {
    const { endpoint, received } = await limitedGateway(1, { headers: { "retry-after": "60" } });

    await expect(caller(endpoint, 5_000)()).rejects.toMatchObject({ status: 429 });
    expect(received).toHaveLength(1);
  });

  it("sends a request any other 4xx or a 5xx refuses once", async () => {
    for (const status of [400, 403, 503]) {
      const { endpoint, received } = await limitedGateway(1, { status });

      await expect(caller(endpoint)()).rejects.toMatchObject({ status });
      expect(received).toHaveLength(1);
    }
  });

  it("leaves the circuit breaker closed on every 4xx, the last 429 included", async () => {
    for (const status of [429, 400]) {
      const { endpoint, received } = await limitedGateway(Number.POSITIVE_INFINITY, { status });
      const call = caller(endpoint);

      for (let i = 0; i < 6; i++) {
        await expect(call()).rejects.toMatchObject({ name: "ModelGatewayError", status });
      }
      expect(received).toHaveLength(status === 429 ? 6 * MAX_ATTEMPTS : 6);
    }
  });

  it("opens a stream once the rate limit lets it through, and fails a refused one without opening the breaker", async () => {
    const limited = await limitedGateway(MAX_ATTEMPTS - 1);
    expect(
      await drain(createGatewayProvider({ endpoint: limited.endpoint }).streamChat(messages)),
    ).toBe("Hello.");
    expect(limited.received).toHaveLength(MAX_ATTEMPTS);

    const refused = await limitedGateway(Number.POSITIVE_INFINITY, { status: 400 });
    const provider = createGatewayProvider({ endpoint: refused.endpoint });
    for (let i = 0; i < 6; i++) {
      await expect(drain(provider.streamChat(messages))).rejects.toMatchObject({
        name: "ModelGatewayError",
        status: 400,
      });
    }
    expect(refused.received).toHaveLength(6);
  });

  it("waits as Retry-After gives it, in seconds or as an HTTP date, and backs off with jitter otherwise", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(retryDelayMs("2", 0, now)).toBe(2_000);
    expect(retryDelayMs(" 0 ", 1, now)).toBe(0);
    expect(retryDelayMs("Thu, 01 Jan 2026 00:00:03 GMT", 0, now)).toBe(3_000);
    expect(retryDelayMs("Wed, 31 Dec 2025 23:59:00 GMT", 0, now)).toBe(0);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      expect(retryDelayMs(null, 0, now)).toBe(250);
      expect(retryDelayMs("", 1, now)).toBe(500);
      expect(retryDelayMs("1.5", 2, now)).toBe(1_000);
      expect(retryDelayMs("soon", 2, now)).toBe(1_000);
    } finally {
      random.mockRestore();
    }
  });
});
