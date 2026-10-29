import {
  createServer,
  type Http2ServerResponse,
  type Http2Session,
  type IncomingHttpHeaders,
} from "node:http2";
import type { AddressInfo } from "node:net";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CircuitBreakerOpenError } from "../../resilience/circuit-breaker.js";
import { createBedrockProvider, DEFAULT_AWS_REGION, DEFAULT_BEDROCK_MODEL } from "../bedrock.js";

// ── Bedrock Request Tests ───────────────────────────────────────────
//
// The bedrock provider calls Converse through the AWS SDK under whatever
// credentials the SDK's default chain resolves. These run it against an
// HTTP/2 server listening in-process on the loopback interface, the
// protocol the SDK's default handler speaks to Bedrock, with static test
// credentials in the environment, so each assertion reads the request as
// Bedrock would receive it and no request leaves the machine. They hold the
// provider to the Converse path and body it sends, to signing with the
// chain's credentials rather than any provider key, to the model and region
// it reads, to failing on a refusal, and to the circuit breaker and timeout
// every call runs under.
//

const REPLY = {
  output: {
    message: {
      role: "assistant",
      content: [{ text: "Hello." }, { text: "Bye. " }],
    },
  },
  stopReason: "end_turn",
  usage: {
    inputTokens: 12,
    outputTokens: 3,
    totalTokens: 15,
    cacheReadInputTokens: 8,
    cacheWriteInputTokens: 0,
  },
  metrics: { latencyMs: 10 },
};

/** A region that differs from DEFAULT_AWS_REGION, so a signature in it shows AWS_REGION was read. */
const SET_REGION = "test-region-1";

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const servers: ReturnType<typeof createServer>[] = [];
const sessions: Http2Session[] = [];

/**
 * A cleartext HTTP/2 server on the loopback interface that answers each
 * request with `answer`, keeping what it received.
 */
async function bedrockServer(answer: (req: Received, res: Http2ServerResponse) => void) {
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
  server.on("session", (session) => sessions.push(session));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  servers.push(server);
  return { endpoint: `http://127.0.0.1:${port}`, received };
}

/** A server that answers as Bedrock's Converse endpoint does. */
function converseServer(reply: object = REPLY) {
  return bedrockServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply));
  });
}

/** A server that refuses every request as Bedrock refuses an invalid model ID. */
function refusingServer() {
  return bedrockServer((_req, res) => {
    res.writeHead(400, {
      "content-type": "application/json",
      "x-amzn-errortype": "ValidationException",
    });
    res.end(JSON.stringify({ message: "The provided model identifier is invalid." }));
  });
}

/** A server that never answers, and reports when the caller cancels the request. */
async function hangingServer() {
  let closed: () => void = () => {};
  const requestClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const { endpoint } = await bedrockServer((_req, res) => {
    res.on("close", () => closed());
  });
  return { endpoint, requestClosed };
}

/** Static test credentials in the environment, where the default chain finds them first. */
function stubChainCredentials() {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDBEDROCKTEST");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "bedrock-test-secret");
  vi.stubEnv("AWS_SESSION_TOKEN", "bedrock-test-session");
  vi.stubEnv("AWS_PROFILE", "");
}

/** A client that calls `endpoint`, on the default credential chain. */
function clientFor(endpoint: string) {
  return new BedrockRuntimeClient({ region: DEFAULT_AWS_REGION, endpoint, maxAttempts: 1 });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const session of sessions.splice(0)) session.destroy();
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("bedrock provider", () => {
  it("sends the system prompt with a cache point and the conversation to Converse, and joins the reply's text", async () => {
    stubChainCredentials();
    vi.stubEnv("LLM_MODEL", "");
    const { endpoint, received } = await converseServer();

    const text = await createBedrockProvider({ client: clientFor(endpoint) }).chat(
      "Answer briefly.",
      [
        { role: "user", content: "Say hello." },
        { role: "assistant", content: "Hi." },
        { role: "user", content: "Again." },
      ],
    );

    expect(text).toBe("Hello.\nBye.");
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(`/model/${encodeURIComponent(DEFAULT_BEDROCK_MODEL)}/converse`);
    expect(DEFAULT_BEDROCK_MODEL).toMatch(/^us\.anthropic\./);
    expect(request?.body).toEqual({
      system: [{ text: "Answer briefly." }, { cachePoint: { type: "default" } }],
      messages: [
        { role: "user", content: [{ text: "Say hello." }] },
        { role: "assistant", content: [{ text: "Hi." }] },
        { role: "user", content: [{ text: "Again." }] },
      ],
      inferenceConfig: { maxTokens: 2048 },
    });
  });

  it("signs with the credentials the default chain resolves and sends no provider key", async () => {
    stubChainCredentials();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    const { endpoint, received } = await converseServer();

    await createBedrockProvider({ client: clientFor(endpoint) }).chat("Answer briefly.", [
      { role: "user", content: "Say hello." },
    ]);

    const headers = received[0]?.headers ?? {};
    expect(headers.authorization).toMatch(
      new RegExp(
        `^AWS4-HMAC-SHA256 Credential=AKIDBEDROCKTEST/\\d{8}/${DEFAULT_AWS_REGION}/bedrock/`,
      ),
    );
    expect(headers["x-amz-security-token"]).toBe("bedrock-test-session");
    expect(headers["x-api-key"]).toBeUndefined();
    expect(JSON.stringify(received)).not.toMatch(/must-not-leave/);
  });

  it("builds its own client at the first call, in AWS_REGION, on the default chain", async () => {
    stubChainCredentials();
    vi.stubEnv("AWS_REGION", SET_REGION);
    const { endpoint, received } = await converseServer();
    vi.stubEnv("AWS_ENDPOINT_URL_BEDROCK_RUNTIME", endpoint);
    vi.stubEnv("AWS_MAX_ATTEMPTS", "1");

    const text = await createBedrockProvider().chat("Answer briefly.", [
      { role: "user", content: "Say hello." },
    ]);

    expect(text).toBe("Hello.\nBye.");
    expect(received[0]?.headers.authorization).toMatch(
      new RegExp(`^AWS4-HMAC-SHA256 Credential=AKIDBEDROCKTEST/\\d{8}/${SET_REGION}/bedrock/`),
    );
  });

  it("names LLM_MODEL, then the model it is given", async () => {
    stubChainCredentials();
    vi.stubEnv("LLM_MODEL", "us.anthropic.claude-haiku-4-5-20251001-v1:0");
    const { endpoint, received } = await converseServer();

    await createBedrockProvider({ client: clientFor(endpoint) }).chat("s", [
      { role: "user", content: "a" },
    ]);
    await createBedrockProvider({
      client: clientFor(endpoint),
      model: "us.anthropic.claude-opus-5",
    }).chat("s", [{ role: "user", content: "b" }]);

    expect(received.map((r) => r.url)).toEqual([
      `/model/${encodeURIComponent("us.anthropic.claude-haiku-4-5-20251001-v1:0")}/converse`,
      `/model/${encodeURIComponent("us.anthropic.claude-opus-5")}/converse`,
    ]);
  });

  it("returns an empty string for a reply that carries no text block and no usage", async () => {
    stubChainCredentials();
    const { endpoint } = await converseServer({
      output: { message: { role: "assistant", content: [] } },
      stopReason: "end_turn",
    });

    expect(
      await createBedrockProvider({ client: clientFor(endpoint) }).chat("s", [
        { role: "user", content: "a" },
      ]),
    ).toBe("");
  });

  it("fails a refused request with Bedrock's error", async () => {
    stubChainCredentials();
    const { endpoint } = await refusingServer();

    await expect(
      createBedrockProvider({ client: clientFor(endpoint) }).chat("s", [
        { role: "user", content: "a" },
      ]),
    ).rejects.toMatchObject({
      name: "ValidationException",
      message: "The provided model identifier is invalid.",
    });
  });

  it("opens its circuit breaker after five failures and stops calling Bedrock", async () => {
    stubChainCredentials();
    const { endpoint, received } = await refusingServer();
    const provider = createBedrockProvider({ client: clientFor(endpoint) });
    const call = () => provider.chat("s", [{ role: "user", content: "a" }]);

    for (let i = 0; i < 5; i++) {
      await expect(call()).rejects.toMatchObject({ name: "ValidationException" });
    }
    await expect(call()).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(received).toHaveLength(5);
  });

  it("gives up on a call at its timeout and cancels the request", async () => {
    stubChainCredentials();
    const { endpoint, requestClosed } = await hangingServer();

    const started = Date.now();
    await expect(
      createBedrockProvider({ client: clientFor(endpoint), requestTimeoutMs: 100 }).chat("s", [
        { role: "user", content: "a" },
      ]),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    await requestClosed;
  });

  it("reads LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    stubChainCredentials();
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "100");
    vi.resetModules();
    const fresh = await import("../bedrock.js");
    const { endpoint, requestClosed } = await hangingServer();

    const started = Date.now();
    await expect(
      fresh
        .createBedrockProvider({ client: clientFor(endpoint) })
        .chat("s", [{ role: "user", content: "a" }]),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    await requestClosed;
  });

  it("fails its import on an LLM_REQUEST_TIMEOUT_MS the config schema refuses", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "30s");
    vi.resetModules();

    await expect(import("../bedrock.js")).rejects.toThrow(
      'LLM_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "30s"',
    );
  });

  it("is registered as bedrock, one instance for every lookup", async () => {
    vi.resetModules();
    const { getProvider, listProviders } = await import("../registry.js");
    await import("../bedrock.js");

    expect(listProviders()).toContain("bedrock");
    expect(getProvider("bedrock")).toBe(getProvider("bedrock"));
  });
});
