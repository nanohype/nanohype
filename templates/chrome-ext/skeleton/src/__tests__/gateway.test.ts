import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGatewayProvider,
  MAX_ATTEMPTS,
  MESSAGES_PATH,
  ModelGatewayError,
  ModelGatewayTimeoutError,
  parseGatewayEndpoint,
  retryDelayMs,
} from "../lib/providers/gateway.js";
import type { ChatMessage } from "../lib/providers/types.js";

// ── Model Gateway Request Tests ─────────────────────────────────────
//
// The extension's gateway provider calls a Platform's ModelGateway at the
// endpoint the options page sets, speaking native Anthropic Messages under
// the gateway's /anthropic prefix, and carries no credential. These run it
// against an HTTP server listening in-process on the loopback interface, so
// each assertion reads the request as the gateway would receive it, headers
// included, and no request leaves the machine.
//

const conversation: ChatMessage[] = [{ role: "user", content: "Summarise this page." }];

const REPLY = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [
    { type: "text", text: "A page " },
    { type: "text", text: "about gateways." },
  ],
  stop_reason: "end_turn",
};

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

/** The headers that would carry a credential, as a gateway would receive them. */
function credentialHeaders(headers: IncomingHttpHeaders): string[] {
  return Object.keys(headers).filter((name) =>
    /^(authorization|proxy-authorization|x-api-key|api-key|cookie|x-amz-.*)$/i.test(name),
  );
}

describe("gateway provider", () => {
  afterEach(async () => {
    vi.useRealTimers();
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("sends a Messages request naming the route, with no credential, to the /anthropic prefix", async () => {
    const { endpoint, received } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(REPLY));
    });

    const text = await createGatewayProvider().sendMessage(conversation, {
      endpoint: `${endpoint}/`,
      route: "summaries",
    });

    expect(text).toBe("A page about gateways.");
    const [request] = received;
    expect(request?.url).toBe(MESSAGES_PATH);
    expect(MESSAGES_PATH).toBe("/anthropic/v1/messages");
    expect(credentialHeaders(request?.headers ?? {})).toEqual([]);
    expect(request?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(request?.body).toEqual({
      model: "summaries",
      max_tokens: 4096,
      messages: conversation,
    });
  });

  it("names the default route when the settings carry none, and omits credentials from fetch", async () => {
    const calls: RequestInit[] = [];
    const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify(REPLY), { status: 200 });
    }) as typeof globalThis.fetch;

    await createGatewayProvider({ fetch }).sendMessage(conversation, {
      endpoint: "http://localhost:8080",
      route: "",
    });

    expect(calls[0]?.credentials).toBe("omit");
    expect(JSON.parse(String(calls[0]?.body))).toMatchObject({ model: "default" });
  });

  it("refuses a stored endpoint off this machine without sending a request", async () => {
    const calls: unknown[] = [];
    const fetch = (async (input: string | URL | Request) => {
      calls.push(input);
      return new Response(JSON.stringify(REPLY), { status: 200 });
    }) as typeof globalThis.fetch;

    for (const endpoint of ["https://gateway.example.internal", "http://10.0.0.5:8080"]) {
      await expect(
        createGatewayProvider({ fetch }).sendMessage(conversation, { endpoint, route: "" }),
      ).rejects.toThrow(/kubectl port-forward/);
    }
    expect(calls).toEqual([]);
  });

  it("fails a refusal with the gateway's status and message", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("no healthy upstream");
    });

    const failure = createGatewayProvider().sendMessage(conversation, {
      endpoint,
      route: "default",
    });

    await expect(failure).rejects.toBeInstanceOf(ModelGatewayError);
    await expect(failure).rejects.toMatchObject({
      status: 503,
      message: "Model gateway answered 503: no healthy upstream",
    });
  });

  it("fails a reply that carries no content array", async () => {
    const { endpoint } = await gatewayServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: "not blocks" }));
    });

    await expect(
      createGatewayProvider().sendMessage(conversation, { endpoint, route: "default" }),
    ).rejects.toThrow("Model gateway sent a reply with no content");
  });

  it("sends a 429 again after its Retry-After, up to MAX_ATTEMPTS sends", async () => {
    let call = 0;
    const { endpoint, received } = await gatewayServer((_req, res) => {
      call += 1;
      if (call < MAX_ATTEMPTS) {
        res.writeHead(429, { "content-type": "application/json", "retry-after": "0" });
        res.end(JSON.stringify({ error: { message: "route default is over its limit" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(REPLY));
    });

    const text = await createGatewayProvider().sendMessage(conversation, {
      endpoint,
      route: "default",
    });

    expect(text).toBe("A page about gateways.");
    expect(received).toHaveLength(MAX_ATTEMPTS);
  });

  it("fails on the last 429 once its sends run out", async () => {
    const { endpoint, received } = await gatewayServer((_req, res) => {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "0" });
      res.end(JSON.stringify({ error: { message: "route default is over its limit" } }));
    });

    await expect(
      createGatewayProvider().sendMessage(conversation, { endpoint, route: "default" }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Model gateway answered 429: route default is over its limit",
    });
    expect(received).toHaveLength(MAX_ATTEMPTS);
  });

  it("fails a 429 at once when its Retry-After ends past the call's timeout", async () => {
    const { endpoint, received } = await gatewayServer((_req, res) => {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "120" });
      res.end("{}");
    });

    await expect(
      createGatewayProvider({ requestTimeoutMs: 5_000 }).sendMessage(conversation, {
        endpoint,
        route: "default",
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(received).toHaveLength(1);
  });

  it("gives up on a call at its timeout and aborts the request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | undefined;
    const fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as typeof globalThis.fetch;
    const call = createGatewayProvider({ requestTimeoutMs: 5_000, fetch })
      .sendMessage(conversation, { endpoint: "http://localhost:8080", route: "default" })
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await call;
    expect(error).toBeInstanceOf(ModelGatewayTimeoutError);
    expect(error).toMatchObject({ timeoutMs: 5_000 });
    expect(signal?.aborted).toBe(true);
  });
});

describe("parseGatewayEndpoint", () => {
  it("takes the http root of a port-forward on a loopback host, without its trailing slash", () => {
    expect(parseGatewayEndpoint("http://localhost:8080/")).toBe("http://localhost:8080");
    expect(parseGatewayEndpoint(" http://localhost:8080 ")).toBe("http://localhost:8080");
    expect(parseGatewayEndpoint("http://127.0.0.1:18080")).toBe("http://127.0.0.1:18080");
  });

  it("refuses every address a port-forward on this machine does not listen on, over https as over http", () => {
    for (const value of [
      "https://gateway.example.internal",
      "http://gateway.example.internal",
      "http://10.0.0.5:8080",
      "http://localhost.example.com:8080",
      "https://localhost:8443",
    ]) {
      expect(() => parseGatewayEndpoint(value)).toThrow(
        /is the address a kubectl port-forward to the gateway Service listens on/,
      );
    }
  });

  it("refuses a path, a query or a fragment, and anything that is not an http URL", () => {
    for (const value of [
      "http://localhost:8080/anthropic",
      "http://localhost:8080/?route=x",
      "http://127.0.0.1:8080/#x",
    ]) {
      expect(() => parseGatewayEndpoint(value)).toThrow(/takes no path, query or fragment/);
    }
    for (const value of ["", "gateway:8080", "ftp://localhost"]) {
      expect(() => parseGatewayEndpoint(value)).toThrow(/must be an http URL/);
    }
  });
});

describe("retryDelayMs", () => {
  it("reads Retry-After in seconds or as an HTTP date, and backs off with jitter otherwise", () => {
    expect(retryDelayMs("2", 0)).toBe(2_000);
    const now = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");
    expect(retryDelayMs("Wed, 21 Oct 2026 07:28:03 GMT", 0, now)).toBe(3_000);
    expect(retryDelayMs("Wed, 21 Oct 2026 07:27:00 GMT", 0, now)).toBe(0);
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = retryDelayMs(null, attempt);
      expect(wait).toBeGreaterThanOrEqual(0);
      expect(wait).toBeLessThan(500 * 2 ** attempt);
    }
  });
});
