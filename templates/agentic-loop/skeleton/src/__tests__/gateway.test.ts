import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createGatewayProvider,
  DEFAULT_MODEL_GATEWAY_ENDPOINT,
  MESSAGES_PATH,
  ModelGatewayError,
  ModelGatewayTimeoutError,
  parseGatewayEndpoint,
} from "../providers/gateway.js";
import type { Message } from "../providers/types.js";
import { CircuitBreakerOpenError } from "../resilience/circuit-breaker.js";
import type { Tool } from "../tools/registry.js";

// ── Model Gateway Request Tests ─────────────────────────────────────
//
// The gateway provider calls the Platform's ModelGateway with `fetch`,
// speaking native Anthropic Messages, tool use included, under the
// gateway's /anthropic prefix, and carries no credential. These run it
// against an HTTP server listening in-process on the loopback interface,
// so each assertion reads the request as the gateway would receive it,
// headers included, and no request leaves the machine. They hold the
// provider to the body it sends in both request modes, to sending no
// credential even when provider keys sit in the environment, to reading
// tool calls and thinking blocks from a reply and from a stream, to
// failing on a refusal, an error event or a stream cut short, to the
// circuit breaker and timeout every call runs under, and to the endpoint
// and route settings it reads as its module loads.
//

const weather: Tool = {
  name: "get_weather",
  description: "Look up the weather for a city.",
  inputSchema: z.object({ city: z.string().describe("The city") }),
  execute: async () => "sunny",
};

const conversation: Message[] = [
  { role: "user", content: "Weather in Oslo?" },
  {
    role: "assistant",
    content: [{ type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Oslo" } }],
    tool_calls: [{ id: "x", type: "function", function: { name: "n", arguments: "{}" } }],
  },
  {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "sunny" }],
  },
];

const THINKING = { type: "thinking", thinking: "Check the tool.", signature: "sig-1" };

const MESSAGE = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "us.anthropic.claude-sonnet-5",
  content: [
    THINKING,
    { type: "text", text: "Checking." },
    { type: "tool_use", id: "toolu_2", name: "get_weather", input: { city: "Bergen" } },
  ],
  stop_reason: "tool_use",
  usage: { input_tokens: 12, output_tokens: 3 },
};

/** The server-sent events of the same reply, streamed. */
function streamedMessage({ stop = true } = {}): string {
  const events: unknown[] = [
    {
      type: "message_start",
      message: { ...MESSAGE, content: [], usage: { input_tokens: 12, output_tokens: 1 } },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "", signature: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "Check " },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "the tool." },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "sig-1" },
    },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "ping" },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Check" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "ing." } },
    { type: "content_block_stop", index: 1 },
    {
      type: "content_block_start",
      index: 2,
      content_block: { type: "tool_use", id: "toolu_2", name: "get_weather", input: {} },
    },
    {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: '{"city":' },
    },
    {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: ' "Bergen"}' },
    },
    { type: "content_block_stop", index: 2 },
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { output_tokens: 3, input_tokens: null },
    },
    ...(stop ? [{ type: "message_stop" }] : []),
  ];
  return events
    .map((data) => `event: ${(data as { type: string }).type}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

interface Received {
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

/** A server that answers as the gateway's Messages endpoint does, streamed when asked. */
function messagesGateway() {
  return gatewayServer((req, res) => {
    if (req.body.stream === true) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(streamedMessage());
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(MESSAGE));
  });
}

/** A server that answers every request with one SSE body. */
function streamingGateway(body: string) {
  return gatewayServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(body);
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

async function drain(stream: AsyncIterable<string>): Promise<string> {
  const text: string[] = [];
  for await (const chunk of stream) text.push(chunk);
  return text.join("");
}

const TOOL_DEFINITION = {
  name: "get_weather",
  description: "Look up the weather for a city.",
  input_schema: {
    type: "object",
    properties: { city: { type: "string", description: "The city" } },
  },
};

describe("gateway provider", () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("sends a Messages request with the tools, the route and no credential to the /anthropic prefix", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token-must-not-leave");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIA-must-not-leave");
    const { endpoint, received } = await messagesGateway();

    await createGatewayProvider({ endpoint }).sendMessage("Be helpful.", conversation, [weather]);

    const [request] = received;
    expect(request?.url).toBe(MESSAGES_PATH);
    expect(MESSAGES_PATH).toBe("/anthropic/v1/messages");
    expect(credentialHeaders(request?.headers ?? {})).toEqual([]);
    expect(JSON.stringify(request)).not.toMatch(/must-not-leave/);
    expect(request?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(request?.body).toEqual({
      model: "default",
      max_tokens: 4096,
      system: [{ type: "text", text: "Be helpful.", cache_control: { type: "ephemeral" } }],
      messages: conversation.map(({ role, content }) => ({ role, content })),
      tools: [TOOL_DEFINITION],
    });
  });

  it("reads tool calls from the reply and keeps every block, thinking included, for the next turn", async () => {
    const { endpoint } = await messagesGateway();

    const response = await createGatewayProvider({ endpoint }).sendMessage("", conversation, []);

    expect(response.toolCalls).toEqual([
      { id: "toolu_2", name: "get_weather", input: { city: "Bergen" } },
    ]);
    expect(response.stopReason).toBe("tool_use");
    expect(response.content).toEqual(MESSAGE.content);
    expect(response.rawAssistantMessage).toEqual({ role: "assistant", content: MESSAGE.content });
    expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it("names the instance's route and leaves out an empty system prompt and tool list", async () => {
    const { endpoint, received } = await messagesGateway();

    await createGatewayProvider({ endpoint, route: "agent" }).sendMessage(
      "",
      [{ role: "user", content: "Hi." }],
      [],
    );

    expect(received[0]?.body).toEqual({
      model: "agent",
      max_tokens: 4096,
      messages: [{ role: "user", content: "Hi." }],
    });
  });

  it("streams the reply's text and builds the same response from the events", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    const { endpoint, received } = await messagesGateway();

    const stream = createGatewayProvider({ endpoint }).streamChat("Be helpful.", conversation, [
      weather,
    ]);

    expect(await drain(stream)).toBe("Checking.");
    const response = await stream.response;
    expect(response.content).toEqual(MESSAGE.content);
    expect(response.toolCalls).toEqual([
      { id: "toolu_2", name: "get_weather", input: { city: "Bergen" } },
    ]);
    expect(response.stopReason).toBe("tool_use");
    expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(received[0]?.url).toBe(MESSAGES_PATH);
    expect(credentialHeaders(received[0]?.headers ?? {})).toEqual([]);
    expect(received[0]?.body).toMatchObject({ stream: true, tools: [TOOL_DEFINITION] });
  });

  it("makes a tool result a user turn carrying a tool_result block", () => {
    const provider = createGatewayProvider({ endpoint: "http://gw:8080" });

    expect(provider.makeToolResultMessage("toolu_2", "rain")).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_2", content: "rain" }],
    });
  });

  it("fails a refused request with the gateway's status and message", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ type: "error", error: { message: "route default is over its limit" } }),
      );
    });

    const failure = createGatewayProvider({ endpoint }).sendMessage("", conversation, []);

    await expect(failure).rejects.toBeInstanceOf(ModelGatewayError);
    await expect(failure).rejects.toMatchObject({
      status: 429,
      message: "Model gateway answered 429: route default is over its limit",
    });
  });

  it("fails a stream Envoy refuses in plain text, in the iteration and the response", async () => {
    const { endpoint } = await refusingGateway();

    const stream = createGatewayProvider({ endpoint }).streamChat("", conversation, []);

    await expect(drain(stream)).rejects.toMatchObject({
      status: 503,
      message: "Model gateway answered 503: no healthy upstream",
    });
    await expect(stream.response).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it("fails a stream that reports an error event", async () => {
    const { endpoint } = await streamingGateway(
      `${streamedMessage().split("event: content_block_start")[0]}event: error\ndata: ${JSON.stringify(
        { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
      )}\n\n`,
    );

    const stream = createGatewayProvider({ endpoint }).streamChat("", conversation, []);

    await expect(drain(stream)).rejects.toThrow("Model gateway stream failed: Overloaded");
    await expect(stream.response).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it("fails a stream that ends before message_stop, carries an unreadable event, or unreadable tool input", async () => {
    const bodies = [
      streamedMessage({ stop: false }),
      `event: message_start\ndata: {"type":\n\n`,
      streamedMessage().replace('"partial_json":"{\\"city\\":"', '"partial_json":"{\\"city"'),
    ];
    let call = 0;
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(bodies[call++]);
    });
    const provider = createGatewayProvider({ endpoint });

    await expect(drain(provider.streamChat("", conversation, []))).rejects.toThrow(
      "Model gateway stream ended before message_stop",
    );
    await expect(drain(provider.streamChat("", conversation, []))).rejects.toThrow(
      "Model gateway sent an unreadable stream event",
    );
    await expect(drain(provider.streamChat("", conversation, []))).rejects.toThrow(
      "Model gateway sent unreadable tool input",
    );
  });

  it("opens its circuit breaker after five failures and stops calling the gateway", async () => {
    const { endpoint, received } = await refusingGateway();
    const provider = createGatewayProvider({ endpoint });

    for (let i = 0; i < 5; i++) {
      await expect(provider.sendMessage("", conversation, [])).rejects.toBeInstanceOf(
        ModelGatewayError,
      );
    }
    await expect(provider.sendMessage("", conversation, [])).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );
    await expect(drain(provider.streamChat("", conversation, []))).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );
    expect(received).toHaveLength(5);
  });

  it("gives up on a request at its timeout and aborts it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | undefined;
    const fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<never>(() => {});
    }) as typeof globalThis.fetch;
    const call = createGatewayProvider({
      endpoint: "http://gw:8080",
      requestTimeoutMs: 5_000,
      fetch,
    })
      .sendMessage("", conversation, [])
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await call;
    expect(error).toBeInstanceOf(ModelGatewayTimeoutError);
    expect(error).toMatchObject({ timeoutMs: 5_000 });
    expect(signal?.aborted).toBe(true);
  });

  it("gives up on a stream when no event arrives within the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | undefined;
    const first = new TextEncoder().encode(
      streamedMessage().split("event: content_block_start")[0],
    );
    const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(first);
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof globalThis.fetch;
    const stream = createGatewayProvider({
      endpoint: "http://gw:8080",
      requestTimeoutMs: 5_000,
      fetch,
    }).streamChat("", conversation, []);
    const outcome = drain(stream).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toBeInstanceOf(ModelGatewayTimeoutError);
    await expect(stream.response).rejects.toBeInstanceOf(ModelGatewayTimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  it("reads MODEL_GATEWAY_ENDPOINT and MODEL_ROUTE as its module loads", async () => {
    const { endpoint, received } = await messagesGateway();
    vi.stubEnv("MODEL_GATEWAY_ENDPOINT", `${endpoint}/`);
    vi.stubEnv("MODEL_ROUTE", "agent");
    vi.resetModules();
    const fresh = await import("../providers/gateway.js");

    await fresh.createGatewayProvider().sendMessage("", conversation, []);

    expect(fresh.MODEL_GATEWAY_ENDPOINT).toBe(endpoint);
    expect(received[0]?.url).toBe(MESSAGES_PATH);
    expect(received[0]?.body.model).toBe("agent");
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
    expect(() => parseGatewayEndpoint("http://gw:8080/?route=x")).toThrow("takes no path");
  });

  it("is registered as gateway, one instance for every lookup", async () => {
    vi.resetModules();
    const { getProvider, listProviders } = await import("../providers/index.js");

    expect(listProviders()).toContain("gateway");
    expect(getProvider("gateway")).toBe(getProvider("gateway"));
  });
});
