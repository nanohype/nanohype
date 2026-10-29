/**
 * Request tests for the gateway embedding provider, the cache's default.
 *
 * The gateway embedder calls the Platform's ModelGateway with `fetch` in the
 * OpenAI embeddings shape and carries no credential. These run it against an
 * HTTP server listening in-process on the loopback interface, so each
 * assertion reads the request as the gateway would receive it, headers
 * included, and no request leaves the machine. They hold the provider to the
 * path and body it sends, to sending no credential even when provider keys
 * sit in the environment, to one request per text, to the vector width, to
 * failing on a refusal, to the circuit breaker and timeout every call runs
 * under, and to the endpoint and route settings it reads as the module loads.
 */

import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CircuitBreakerOpenError } from "../circuit-breaker.js";
import {
  DEFAULT_MODEL_GATEWAY_ENDPOINT,
  EMBEDDINGS_PATH,
  GatewayEmbedder,
  MAX_ATTEMPTS,
  ModelGatewayError,
  parseGatewayEndpoint,
  retryDelayMs,
} from "../embedder/gateway.js";
import { getEmbeddingProvider, listEmbeddingProviders } from "../embedder/index.js";

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const servers: ReturnType<typeof createServer>[] = [];

/**
 * An HTTP server on the loopback interface that answers each request with
 * `answer`, keeping what it received and noting each request whose
 * connection closed before an answer went out.
 */
async function gatewayServer(answer: (req: Received, res: ServerResponse) => void) {
  const received: Received[] = [];
  const dropped: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("close", () => {
      if (!res.writableFinished) dropped.push(req.url ?? "");
    });
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
  return { endpoint: `http://127.0.0.1:${port}`, received, dropped };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** A server that answers as the gateway's embeddings endpoint does. */
function gateway(width = 4) {
  return gatewayServer((req, res) => {
    const input = String(req.body.input);
    json(res, 200, {
      object: "list",
      model: "amazon.titan-embed-text-v2:0",
      data: [{ object: "embedding", index: 0, embedding: Array(width).fill(input.length) }],
    });
  });
}

/** A server that refuses every request as Envoy does, in plain text. */
function refusingGateway() {
  return gatewayServer((_req, res) => {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("no healthy upstream");
  });
}

/** The headers that would carry a credential, as a gateway would receive them. */
function credentialHeaders(headers: IncomingHttpHeaders): string[] {
  return Object.keys(headers).filter((name) =>
    /^(authorization|proxy-authorization|x-api-key|api-key|cookie|x-amz-.*)$/i.test(name),
  );
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("gateway embedder request", () => {
  it("sends an embeddings request naming the route and width, with no credential, under /v1", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "aws-must-not-leave");
    const { endpoint, received } = await gateway();

    const vector = await new GatewayEmbedder({ endpoint, dimensions: 4 }).embed("hello");

    expect(vector).toEqual([5, 5, 5, 5]);
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(EMBEDDINGS_PATH);
    expect(EMBEDDINGS_PATH).toBe("/v1/embeddings");
    expect(credentialHeaders(request?.headers ?? {})).toEqual([]);
    expect(JSON.stringify(request)).not.toMatch(/must-not-leave/);
    expect(request?.headers["content-type"]).toBe("application/json");
    expect(request?.body).toEqual({ model: "embeddings", input: "hello", dimensions: 4 });
  });

  it("embeds a batch one request per text, in order", async () => {
    const { endpoint, received } = await gateway();

    const vectors = await new GatewayEmbedder({
      endpoint,
      dimensions: 4,
      route: "titan",
    }).embedBatch(["a", "bbb", "cc"]);

    expect(vectors).toEqual([Array(4).fill(1), Array(4).fill(3), Array(4).fill(2)]);
    expect(received.map((r) => r.body)).toEqual([
      { model: "titan", input: "a", dimensions: 4 },
      { model: "titan", input: "bbb", dimensions: 4 },
      { model: "titan", input: "cc", dimensions: 4 },
    ]);
  });

  it("refuses a vector that is not the configured width", async () => {
    const { endpoint } = await gateway(3);

    await expect(new GatewayEmbedder({ endpoint, dimensions: 4 }).embed("x")).rejects.toThrow(
      "Model gateway returned a 3-dimension vector, expected 4",
    );
  });

  it("refuses a reply that carries no vector", async () => {
    const { endpoint } = await gatewayServer((_req, res) => json(res, 200, { data: [] }));

    await expect(new GatewayEmbedder({ endpoint, dimensions: 4 }).embed("x")).rejects.toThrow(
      "Model gateway returned a 0-dimension vector, expected 4",
    );
  });

  it("defaults to 1024 dimensions, the Titan v2 width", () => {
    expect(new GatewayEmbedder({ endpoint: "http://gw:8080" }).dimensions).toBe(1024);
  });

  it("fails a refused request with the gateway's status and message", async () => {
    const { endpoint } = await gatewayServer((_req, res) =>
      json(res, 400, { error: { message: "AWS Bedrock Titan does not support batch embeddings" } }),
    );

    const failure = new GatewayEmbedder({ endpoint, dimensions: 4 }).embed("x");

    await expect(failure).rejects.toBeInstanceOf(ModelGatewayError);
    await expect(failure).rejects.toMatchObject({
      status: 400,
      message: "Model gateway answered 400: AWS Bedrock Titan does not support batch embeddings",
    });
  });

  it("fails a request Envoy refuses in plain text", async () => {
    const { endpoint } = await refusingGateway();

    await expect(new GatewayEmbedder({ endpoint, dimensions: 4 }).embed("x")).rejects.toMatchObject(
      { status: 503, message: "Model gateway answered 503: no healthy upstream" },
    );
  });

  it("opens its circuit breaker after five failures and stops calling the gateway", async () => {
    const { endpoint, received } = await refusingGateway();
    const embedder = new GatewayEmbedder({ endpoint, dimensions: 4 });

    for (let i = 0; i < 5; i++) {
      await expect(embedder.embed("x")).rejects.toBeInstanceOf(ModelGatewayError);
    }
    await expect(embedder.embed("x")).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(received).toHaveLength(5);
  });

  it("gives up on a call at its timeout and drops the connection", async () => {
    const { endpoint, received, dropped } = await gatewayServer(() => {
      // Never answers.
    });
    const started = Date.now();

    await expect(
      new GatewayEmbedder({ endpoint, dimensions: 4, requestTimeoutMs: 100 }).embed("x"),
    ).rejects.toMatchObject({ name: "TimeoutError" });

    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(received).toHaveLength(1);
    await vi.waitFor(() => expect(dropped).toEqual([EMBEDDINGS_PATH]));
  });
});

describe("gateway settings", () => {
  it("reads MODEL_GATEWAY_ENDPOINT, EMBEDDING_ROUTE and EMBED_REQUEST_TIMEOUT_MS as the module loads", async () => {
    const { endpoint, received } = await gateway();
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", `${endpoint}/`);
    vi.stubEnv("EMBEDDING_ROUTE", "vectors");
    vi.stubEnv("EMBED_REQUEST_TIMEOUT_MS", "1234");
    vi.resetModules();
    const fresh = await import("../embedder/gateway.js");
    const timeout = await import("../embedder/request-timeout.js");

    await new fresh.GatewayEmbedder({ dimensions: 4 }).embed("x");

    expect(fresh.MODEL_GATEWAY_ENDPOINT).toBe(endpoint);
    expect(timeout.EMBED_REQUEST_TIMEOUT_MS).toBe(1234);
    expect(received.map((r) => [r.url, r.body.model])).toEqual([[EMBEDDINGS_PATH, "vectors"]]);
  });

  it("defaults to the Service the operator creates for the Platform, and the embeddings route", async () => {
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", "");
    vi.stubEnv("EMBEDDING_ROUTE", "");
    vi.resetModules();
    const fresh = await import("../embedder/gateway.js");

    expect(fresh.MODEL_GATEWAY_ENDPOINT).toBe(DEFAULT_MODEL_GATEWAY_ENDPOINT);
    expect(fresh.EMBEDDING_ROUTE).toBe("embeddings");
    // <platform>-gateway in tenants-<platform>, on the gateway's 8080 listener.
    expect(DEFAULT_MODEL_GATEWAY_ENDPOINT).toMatch(
      /^http:\/\/([a-z_][a-z0-9_-]*)-gateway\.tenants-\1\.svc\.cluster\.local:8080$/i,
    );
  });

  it("fails its import on a MODEL_GATEWAY_ENDPOINT that is not a gateway root", async () => {
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", "http://app-gateway.tenants-app.svc:8080/v1");
    vi.resetModules();

    await expect(import("../embedder/gateway.js")).rejects.toThrow(
      'MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway status.endpoint publishes it, and takes no path, query or fragment, got "http://app-gateway.tenants-app.svc:8080/v1"',
    );
  });

  it("takes an http or https root and refuses anything else", () => {
    expect(parseGatewayEndpoint("https://gw.example:8443")).toBe("https://gw.example:8443");
    expect(parseGatewayEndpoint("http://gw:8080/")).toBe("http://gw:8080");
    expect(parseGatewayEndpoint(undefined)).toBe(DEFAULT_MODEL_GATEWAY_ENDPOINT);
    expect(() => parseGatewayEndpoint("gw:8080")).toThrow(
      'MODEL_GATEWAY_ENDPOINT must be an http or https URL, got "gw:8080"',
    );
    expect(() => parseGatewayEndpoint("not a url")).toThrow(
      'MODEL_GATEWAY_ENDPOINT must be an http or https URL, got "not a url"',
    );
    expect(() => parseGatewayEndpoint("http://gw:8080/v1")).toThrow(/takes no path/);
    expect(() => parseGatewayEndpoint("http://gw:8080/?x=1")).toThrow(/takes no path/);
    expect(() => parseGatewayEndpoint("http://gw:8080/#f")).toThrow(/takes no path/);
  });

  it("registers as gateway, a fresh instance for each cache", () => {
    expect(listEmbeddingProviders()).toContain("gateway");
    const first = getEmbeddingProvider("gateway");
    expect(first).toBeInstanceOf(GatewayEmbedder);
    expect(first.name).toBe("gateway");
    expect(first.dimensions).toBe(1024);
    expect(getEmbeddingProvider("gateway")).not.toBe(first);
  });

  it("is the provider a cache uses when it names none", async () => {
    const { endpoint, received } = await gateway(1024);
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", endpoint);
    vi.resetModules();
    const { createSemanticCache } = await import("../index.js");

    const cache = await createSemanticCache({ vectorBackend: "memory" });
    await cache.store("What is TypeScript?", "A typed superset of JavaScript.");
    const hit = await cache.lookup("What is TypeScript?");
    await cache.close();

    expect(cache.embedder.name).toBe("gateway");
    expect(hit?.response).toBe("A typed superset of JavaScript.");
    expect(received.map((r) => [r.url, r.body.input])).toEqual([
      [EMBEDDINGS_PATH, "What is TypeScript?"],
      [EMBEDDINGS_PATH, "What is TypeScript?"],
    ]);
  });
});

describe("a request the route's rate limit refuses", () => {
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
      json(res, 200, { data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] });
    });
  }

  /** One call through a client of its own, as the template makes it. */
  function caller(endpoint: string, requestTimeoutMs?: number): () => Promise<unknown> {
    const embedder = new GatewayEmbedder({ endpoint, dimensions: 4, requestTimeoutMs });
    return () => embedder.embed("x");
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
