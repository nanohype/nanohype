/**
 * Request tests for the gateway provider.
 *
 * The gateway provider calls the Platform's ModelGateway with `fetch` in
 * native Anthropic Messages and carries no credential. These run it against
 * an HTTP server listening in-process on the loopback interface, so each
 * assertion reads the request as the gateway would receive it, headers
 * included, and no request leaves the machine. They hold the provider to the
 * path and body it sends, to sending no credential even when provider keys
 * sit in the environment, to naming its route rather than the model a caller
 * passes, to reading a reply and a stream, to failing on a refusal, a broken
 * stream and a timeout, to dropping the connection when it gives up, and to
 * the settings it reads as the module loads.
 */

import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider, listProviders } from "@/lib/ai/providers";
import {
  DEFAULT_MODEL_GATEWAY_ENDPOINT,
  GatewayProvider,
  MESSAGES_PATH,
  ModelGatewayError,
  ModelGatewayTimeoutError,
  parseGatewayEndpoint,
  parseRequestTimeout,
} from "@/lib/ai/providers/gateway";

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
 * connection closed before its answer finished.
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

/** Server-sent events carrying `events`, each as one `data:` line. */
function sse(events: unknown[]): string {
  return events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");
}

const delta = (text: string) => ({
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text },
});

const STREAM = [
  { type: "message_start", message: { id: "msg_test", usage: { input_tokens: 9 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  delta("Hel"),
  { type: "ping" },
  delta("lo"),
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } },
  { type: "message_stop" },
];

/** A server that answers as the gateway's Messages endpoint does, streaming on request. */
function gateway() {
  return gatewayServer((req, res) => {
    if (req.body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse(STREAM));
      return;
    }
    json(res, 200, {
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [
        { type: "text", text: "Hello" },
        { type: "tool_use", id: "t", name: "n", input: {} },
        { type: "text", text: " there" },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 9, output_tokens: 2 },
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

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

const MESSAGES = [
  { role: "user" as const, content: "Hi" },
  { role: "assistant" as const, content: "Hello" },
  { role: "user" as const, content: "How are you?" },
];

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("gateway provider request", () => {
  it("sends a Messages request naming the route, with no credential, to the /anthropic prefix", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "aws-must-not-leave");
    const { endpoint, received } = await gateway();

    const reply = await new GatewayProvider({ endpoint }).sendMessage(MESSAGES);

    expect(reply).toBe("Hello there");
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(MESSAGES_PATH);
    expect(MESSAGES_PATH).toBe("/anthropic/v1/messages");
    expect(credentialHeaders(request?.headers ?? {})).toEqual([]);
    expect(JSON.stringify(request)).not.toMatch(/must-not-leave/);
    expect(request?.headers["content-type"]).toBe("application/json");
    expect(request?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(request?.body).toEqual({ model: "default", max_tokens: 4096, messages: MESSAGES });
  });

  it("names its route, not the model a caller passes, and reports the route as its model", async () => {
    const { endpoint, received } = await gateway();
    const provider = new GatewayProvider({ endpoint, route: "chat" });

    await provider.sendMessage(MESSAGES, "gpt-4o");
    await collect(provider.streamMessage(MESSAGES, "gpt-4o"));

    expect(provider.defaultModel).toBe("chat");
    expect(received.map((r) => r.body.model)).toEqual(["chat", "chat"]);
  });

  it("streams the reply's text deltas and asks for a stream", async () => {
    const { endpoint, received } = await gateway();

    const chunks = await collect(new GatewayProvider({ endpoint }).streamMessage(MESSAGES));

    expect(chunks).toEqual(["Hel", "lo"]);
    expect(received[0]?.body).toMatchObject({ stream: true, model: "default" });
    expect(credentialHeaders(received[0]?.headers ?? {})).toEqual([]);
  });

  it("reads an event split across chunks and a last event with no trailing newline", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const body = sse([delta("one"), delta("two")]);
      const cut = body.indexOf("two") - 3;
      res.write(body.slice(0, cut));
      setTimeout(() => {
        res.write(body.slice(cut));
        res.end(`data: ${JSON.stringify({ type: "message_stop" })}`);
      }, 10);
    });

    const chunks = await collect(new GatewayProvider({ endpoint }).streamMessage(MESSAGES));

    expect(chunks).toEqual(["one", "two"]);
  });

  it("fails a refused request with the gateway's status and message", async () => {
    const { endpoint } = await gatewayServer((_req, res) =>
      json(res, 429, {
        type: "error",
        error: { type: "rate_limit_error", message: "route default is over its limit" },
      }),
    );
    const provider = new GatewayProvider({ endpoint });

    const failure = provider.sendMessage(MESSAGES);
    await expect(failure).rejects.toBeInstanceOf(ModelGatewayError);
    await expect(failure).rejects.toMatchObject({
      status: 429,
      message: "Model gateway answered 429: route default is over its limit",
    });
    await expect(collect(provider.streamMessage(MESSAGES))).rejects.toMatchObject({
      status: 429,
    });
  });

  it("fails a request Envoy refuses in plain text", async () => {
    const { endpoint } = await refusingGateway();

    await expect(new GatewayProvider({ endpoint }).sendMessage(MESSAGES)).rejects.toMatchObject({
      status: 503,
      message: "Model gateway answered 503: no healthy upstream",
    });
  });

  it("fails a reply with no content", async () => {
    const { endpoint } = await gatewayServer((_req, res) => json(res, 200, { type: "message" }));

    await expect(new GatewayProvider({ endpoint }).sendMessage(MESSAGES)).rejects.toThrow(
      "Model gateway sent a reply with no content",
    );
  });

  it("fails a stream that reports an error, after the text before it", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse([delta("partial"), { type: "error", error: { message: "Overloaded" } }]));
    });
    const seen: string[] = [];

    await expect(
      (async () => {
        for await (const chunk of new GatewayProvider({ endpoint }).streamMessage(MESSAGES)) {
          seen.push(chunk);
        }
      })(),
    ).rejects.toThrow("Model gateway stream failed: Overloaded");
    expect(seen).toEqual(["partial"]);
  });

  it("fails a stream that ends before message_stop", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse([delta("cut")]));
    });

    await expect(
      collect(new GatewayProvider({ endpoint }).streamMessage(MESSAGES)),
    ).rejects.toThrow("Model gateway stream ended before message_stop");
  });

  it("fails a stream carrying an unreadable event", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end("data: {not json\n\n");
    });

    await expect(
      collect(new GatewayProvider({ endpoint }).streamMessage(MESSAGES)),
    ).rejects.toThrow("Model gateway sent an unreadable stream event");
  });

  it("gives up on a call the gateway never answers and drops the connection", async () => {
    const { endpoint, dropped } = await gatewayServer(() => {
      // Never answers.
    });

    const failure = new GatewayProvider({ endpoint, requestTimeoutMs: 100 }).sendMessage(MESSAGES);

    await expect(failure).rejects.toBeInstanceOf(ModelGatewayTimeoutError);
    await expect(failure).rejects.toMatchObject({ timeoutMs: 100 });
    await vi.waitFor(() => expect(dropped).toEqual([MESSAGES_PATH]));
  });

  it("gives up on a stream that goes quiet and drops the connection", async () => {
    const { endpoint, dropped } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(sse([delta("first")]));
      // Never sends another event.
    });
    const seen: string[] = [];

    await expect(
      (async () => {
        const stream = new GatewayProvider({ endpoint, requestTimeoutMs: 100 }).streamMessage(
          MESSAGES,
        );
        for await (const chunk of stream) seen.push(chunk);
      })(),
    ).rejects.toBeInstanceOf(ModelGatewayTimeoutError);
    expect(seen).toEqual(["first"]);
    await vi.waitFor(() => expect(dropped).toEqual([MESSAGES_PATH]));
  });

  it("drops the connection when a consumer stops reading a stream early", async () => {
    const { endpoint, dropped } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(sse([delta("first"), delta("second")]));
    });

    for await (const chunk of new GatewayProvider({ endpoint }).streamMessage(MESSAGES)) {
      expect(chunk).toBe("first");
      break;
    }

    await vi.waitFor(() => expect(dropped).toEqual([MESSAGES_PATH]));
  });
});

describe("gateway settings", () => {
  it("reads MODEL_GATEWAY_ENDPOINT, MODEL_ROUTE and LLM_REQUEST_TIMEOUT_MS as the module loads", async () => {
    const { endpoint, received } = await gateway();
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", `${endpoint}/`);
    vi.stubEnv("MODEL_ROUTE", "answers");
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "4321");
    vi.resetModules();
    const fresh = await import("@/lib/ai/providers/gateway");

    await new fresh.GatewayProvider().sendMessage(MESSAGES);

    expect(fresh.MODEL_GATEWAY_ENDPOINT).toBe(endpoint);
    expect(fresh.REQUEST_TIMEOUT_MS).toBe(4321);
    expect(received.map((r) => [r.url, r.body.model])).toEqual([[MESSAGES_PATH, "answers"]]);
  });

  it("defaults to the Service the operator creates for the Platform, the default route and 120s", async () => {
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", "");
    vi.stubEnv("MODEL_ROUTE", "");
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "");
    vi.resetModules();
    const fresh = await import("@/lib/ai/providers/gateway");

    expect(fresh.MODEL_GATEWAY_ENDPOINT).toBe(DEFAULT_MODEL_GATEWAY_ENDPOINT);
    expect(fresh.MODEL_ROUTE).toBe("default");
    expect(fresh.REQUEST_TIMEOUT_MS).toBe(120_000);
    // <platform>-gateway in tenants-<platform>, on the gateway's 8080 listener.
    expect(DEFAULT_MODEL_GATEWAY_ENDPOINT).toMatch(
      /^http:\/\/([a-z_][a-z0-9_-]*)-gateway\.tenants-\1\.svc\.cluster\.local:8080$/i,
    );
  });

  it("fails its import on a MODEL_GATEWAY_ENDPOINT that is not a gateway root", async () => {
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", "http://app-gateway.tenants-app.svc:8080/v1");
    vi.resetModules();

    await expect(import("@/lib/ai/providers/gateway")).rejects.toThrow(
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

  it("takes a whole number of milliseconds a timer accepts and refuses anything else", () => {
    expect(parseRequestTimeout(undefined)).toBe(120_000);
    expect(parseRequestTimeout("1")).toBe(1);
    expect(parseRequestTimeout("2147483647")).toBe(2_147_483_647);
    for (const bad of ["0", "2147483648", "1.5", "-5", "30s", " 100"]) {
      expect(() => parseRequestTimeout(bad)).toThrow(
        `LLM_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "${bad}"`,
      );
    }
  });

  it("registers as gateway", () => {
    expect(listProviders()).toContain("gateway");
    expect(getProvider("gateway")).toBeInstanceOf(GatewayProvider);
    expect(getProvider("gateway").defaultModel).toBe("default");
  });
});
