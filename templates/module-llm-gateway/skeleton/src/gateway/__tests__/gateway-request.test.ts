import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getModelPricing } from "../cost/pricing.js";
import { CircuitBreakerOpenError } from "../providers/circuit-breaker.js";
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
import { RequestTimeoutError } from "../providers/request-timeout.js";
import type { ChatMessage } from "../types.js";

// ── Model Gateway Request Tests ─────────────────────────────────────
//
// The gateway provider calls the Platform's ModelGateway with `fetch`,
// speaking native Anthropic Messages under the gateway's /anthropic
// prefix, and carries no credential. These run it against an HTTP server
// listening in-process on the loopback interface, so each assertion reads
// the request as the gateway would receive it, headers included, and no
// request leaves the machine. They hold the provider to the path and body
// it sends, to sending no credential even when provider keys sit in the
// environment, to reading the reply, its usage and its cache tokens, to
// failing on a refusal, to the circuit breaker and timeout every call
// runs under, and to the endpoint and route settings it reads as its
// module loads.
//

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

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
    cache_read_input_tokens: 1_000_000,
    cache_creation_input_tokens: null,
  },
};

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const servers: ReturnType<typeof createServer>[] = [];

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

/** A server that answers as the gateway's Messages endpoint does. */
function messagesGateway() {
  return gatewayServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(MESSAGE));
  });
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
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("sends a Messages request naming the route, with no credential, to the /anthropic prefix", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token-must-not-leave");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIA-must-not-leave");
    const { endpoint, received } = await messagesGateway();

    await createGatewayProvider({ endpoint }).chat(messages, { maxTokens: 64, temperature: 0.2 });

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
    });
  });

  it("declares through its sampling hook that no request carries temperature", () => {
    const provider = createGatewayProvider({ endpoint: "http://gw:8080" });

    expect(provider.sampling?.({ temperature: 0.2 })).toEqual({});
  });

  it("reads the reply's text, model, usage and cache tokens, and bills cache reads at 10%", async () => {
    const { endpoint } = await messagesGateway();

    const response = await createGatewayProvider({ endpoint }).chat(messages);

    expect(response).toMatchObject({
      text: "Hello.",
      model: "us.anthropic.claude-sonnet-5",
      provider: "gateway",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cached: false,
      cacheReadTokens: 1_000_000,
    });
    expect(response).not.toHaveProperty("cacheWriteTokens");
    // 3 per million input, 0.3 per million cache read, 15 per million output.
    expect(response.cost).toBeCloseTo(18.3);
  });

  it("bills a reply at the rate of the inference profile it names", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...MESSAGE, model: "us.anthropic.claude-haiku-4-5-20251001-v1:0" }));
    });

    const response = await createGatewayProvider({ endpoint }).chat(messages);

    // 1 per million input, 0.1 per million cache read, 5 per million output.
    expect(response.cost).toBeCloseTo(6.1);
  });

  it("prices its route at DEFAULT_ROUTE_MODEL's rate unless built with one, and bills an unlisted model at it", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...MESSAGE, model: "us.example.unlisted-model-v1:0" }));
    });

    expect(createGatewayProvider({ endpoint }).pricing).toEqual(
      getModelPricing(DEFAULT_ROUTE_MODEL),
    );
    const provider = createGatewayProvider({ endpoint, pricing: { input: 1, output: 5 } });
    expect(provider.pricing).toEqual({ input: 1, output: 5 });

    const response = await provider.chat(messages);

    expect(response.cost).toBeCloseTo(6.1);
  });

  it("bills cache writes at 125% of the input rate", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ...MESSAGE,
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 },
        }),
      );
    });

    const response = await createGatewayProvider({ endpoint }).chat(messages);

    expect(response.cacheWriteTokens).toBe(1_000_000);
    expect(response.cost).toBeCloseTo(3.75);
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

    const failure = createGatewayProvider({ endpoint }).chat(messages);

    await expect(failure).rejects.toBeInstanceOf(ModelGatewayError);
    await expect(failure).rejects.toMatchObject({
      status: 429,
      message: "Model gateway answered 429: route default is over its limit",
    });
  });

  it("fails a request Envoy refuses in plain text", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("no healthy upstream");
    });

    await expect(createGatewayProvider({ endpoint }).chat(messages)).rejects.toMatchObject({
      status: 503,
      message: "Model gateway answered 503: no healthy upstream",
    });
  });

  it("opens its circuit breaker after five failures and stops calling the gateway", async () => {
    const { endpoint, received } = await gatewayServer((_req, res) => {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("no healthy upstream");
    });
    const provider = createGatewayProvider({ endpoint });

    for (let i = 0; i < 5; i++) {
      await expect(provider.chat(messages)).rejects.toBeInstanceOf(ModelGatewayError);
    }
    await expect(provider.chat(messages)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(received).toHaveLength(5);
  });

  it("gives up on a call at its timeout and aborts the request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | undefined;
    const fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<never>(() => {});
    }) as typeof globalThis.fetch;
    const chat = createGatewayProvider({
      endpoint: "http://gw:8080",
      requestTimeoutMs: 5_000,
      fetch,
    })
      .chat(messages)
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await chat;
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error).toMatchObject({ timeoutMs: 5_000 });
    expect(signal?.aborted).toBe(true);
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
