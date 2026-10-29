import {
  createServer,
  type Http2ServerResponse,
  type Http2Session,
  type IncomingHttpHeaders,
} from "node:http2";
import type { AddressInfo } from "node:net";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProcessedInput } from "../processors/types.js";
import { createBedrockProvider, DEFAULT_AWS_REGION, isClaudeModel } from "../providers/bedrock.js";
import { CircuitBreakerOpenError } from "../resilience/circuit-breaker.js";

// ── Bedrock Request Tests ───────────────────────────────────────────
//
// The bedrock provider calls Converse through the AWS SDK under whatever
// credentials the SDK's default chain resolves. These run it against an
// HTTP/2 server listening in-process on the loopback interface, the
// protocol the SDK's default handler speaks to Bedrock, with session test
// credentials in the environment, so each assertion reads the request as
// Bedrock would receive it and no request leaves the machine. They hold the
// provider to the Converse path and body it sends for an image, a
// transcript and a run of video frames, to signing with the chain's
// credentials rather than any provider key, to the region it reads, to the
// temperature rule per model family, to failing on a refusal, and to the
// circuit breaker and timeout every call runs under.
//

const CLAUDE = "us.anthropic.claude-sonnet-5";
const LLAMA = "us.meta.llama3-3-70b-instruct-v1:0";

const REPLY = {
  output: { message: { role: "assistant", content: [{ text: "Hello." }, { text: " Bye." }] } },
  stopReason: "end_turn",
  usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
  metrics: { latencyMs: 10 },
};

/** A region that differs from DEFAULT_AWS_REGION, so a signature in it shows AWS_REGION was read. */
const SET_REGION = "test-region-1";

const IMAGE = {
  modality: "image",
  mimeType: "image/png",
  source: "photo.png",
  base64: "aW1hZ2U=",
  metadata: {},
} satisfies ProcessedInput;

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const servers: ReturnType<typeof createServer>[] = [];
const sessions: Http2Session[] = [];

/** A cleartext HTTP/2 server on the loopback interface that answers each request with `answer`. */
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
function converseServer() {
  return bedrockServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(REPLY));
  });
}

/** A server that refuses every request as Bedrock refuses an invalid one. */
function refusingServer() {
  return bedrockServer((_req, res) => {
    res.writeHead(400, {
      "content-type": "application/json",
      "x-amzn-errortype": "ValidationException",
    });
    res.end(JSON.stringify({ message: "The provided model identifier is invalid." }));
  });
}

/** Session test credentials in the environment, where the default chain finds them first. */
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
  it("sends an image to Converse for the model it is given and returns the reply", async () => {
    stubChainCredentials();
    const { endpoint, received } = await converseServer();

    const result = await createBedrockProvider({ client: clientFor(endpoint) }).analyze(
      IMAGE,
      "Describe it.",
      CLAUDE,
      undefined,
      64,
    );

    expect(result).toEqual({
      content: "Hello. Bye.",
      model: CLAUDE,
      usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
    });
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(`/model/${encodeURIComponent(CLAUDE)}/converse`);
    expect(request?.body).toEqual({
      system: [{ text: "Describe it." }, { cachePoint: { type: "default" } }],
      messages: [
        {
          role: "user",
          content: [
            { image: { format: "png", source: { bytes: "aW1hZ2U=" } } },
            { text: "Analyze this image and provide a detailed structured description." },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 64 },
    });
  });

  it("signs with the credentials the default chain resolves and sends no provider key", async () => {
    stubChainCredentials();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    const { endpoint, received } = await converseServer();

    await createBedrockProvider({ client: clientFor(endpoint) }).analyze(
      IMAGE,
      "Describe it.",
      CLAUDE,
      undefined,
      64,
    );

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

    const result = await createBedrockProvider().analyze(
      IMAGE,
      "Describe it.",
      CLAUDE,
      undefined,
      64,
    );

    expect(result.content).toBe("Hello. Bye.");
    expect(received[0]?.headers.authorization).toMatch(
      new RegExp(`^AWS4-HMAC-SHA256 Credential=AKIDBEDROCKTEST/\\d{8}/${SET_REGION}/bedrock/`),
    );
  });

  it("sends the configured temperature to a model of another family and none to Claude", async () => {
    stubChainCredentials();
    const { endpoint, received } = await converseServer();
    const provider = createBedrockProvider({ client: clientFor(endpoint) });

    await provider.analyze(IMAGE, "Describe it.", LLAMA, 0.2, 64);
    await provider.analyze(IMAGE, "Describe it.", CLAUDE, 0.2, 64);
    await provider.analyze(IMAGE, "Describe it.", LLAMA, undefined, 64);

    expect(received.map((r) => r.body.inferenceConfig)).toEqual([
      { maxTokens: 64, temperature: 0.2 },
      { maxTokens: 64 },
      { maxTokens: 64 },
    ]);
  });

  it.each([
    [CLAUDE, true],
    ["anthropic.claude-haiku-4-5-20251001-v1:0", true],
    ["eu.anthropic.claude-haiku-4-5-20251001-v1:0", true],
    [LLAMA, false],
    ["amazon.nova-pro-v1:0", false],
    ["acme.anthropic-tuned-v1:0", false],
  ])("reads %s as a Claude model: %s", (model, claude) => {
    expect(isClaudeModel(model)).toBe(claude);
  });

  it("sends transcribed text, and video frames in order", async () => {
    stubChainCredentials();
    const { endpoint, received } = await converseServer();
    const provider = createBedrockProvider({ client: clientFor(endpoint) });

    await provider.analyze(
      {
        modality: "audio",
        mimeType: "audio/mpeg",
        source: "talk.mp3",
        text: "a talk",
        metadata: {},
      },
      "Describe it.",
      CLAUDE,
      undefined,
      64,
    );
    await provider.analyzeFrames(["ZjE=", "ZjI="], "Describe it.", CLAUDE, undefined, 64);

    expect(received[0]?.body.messages).toEqual([
      { role: "user", content: [{ text: "Analyze the following transcribed content:\n\na talk" }] },
    ]);
    expect(received[1]?.body.messages).toEqual([
      {
        role: "user",
        content: [
          { image: { format: "jpeg", source: { bytes: "ZjE=" } } },
          { text: "Frame 1 of 2" },
          { image: { format: "jpeg", source: { bytes: "ZjI=" } } },
          { text: "Frame 2 of 2" },
          {
            text: "Analyze these video frames in sequence and provide a structured description of the video content.",
          },
        ],
      },
    ]);
  });

  it("refuses an image format Converse does not take, before sending anything", async () => {
    stubChainCredentials();
    const { endpoint, received } = await converseServer();

    await expect(
      createBedrockProvider({ client: clientFor(endpoint) }).analyze(
        { ...IMAGE, mimeType: "image/tiff" },
        "Describe it.",
        CLAUDE,
        undefined,
        64,
      ),
    ).rejects.toThrow("Bedrock takes jpeg, png, gif or webp images, got image/tiff");
    expect(received).toHaveLength(0);
  });

  it("fails a refused request with Bedrock's error", async () => {
    stubChainCredentials();
    const { endpoint } = await refusingServer();

    await expect(
      createBedrockProvider({ client: clientFor(endpoint) }).analyze(
        IMAGE,
        "Describe it.",
        CLAUDE,
        undefined,
        64,
      ),
    ).rejects.toMatchObject({
      name: "ValidationException",
      message: "The provided model identifier is invalid.",
    });
  });

  it("opens its circuit breaker after five failures and stops calling Bedrock", async () => {
    stubChainCredentials();
    const { endpoint, received } = await refusingServer();
    const provider = createBedrockProvider({ client: clientFor(endpoint) });
    const call = () => provider.analyze(IMAGE, "Describe it.", CLAUDE, undefined, 64);

    for (let i = 0; i < 5; i++) {
      await expect(call()).rejects.toMatchObject({ name: "ValidationException" });
    }
    await expect(call()).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(received).toHaveLength(5);
  });

  it("gives up on a call at its timeout and cancels the request", async () => {
    stubChainCredentials();
    let closed: () => void = () => {};
    const requestClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const { endpoint } = await bedrockServer((_req, res) => {
      // Never answers; the stream closes only when the caller cancels it.
      res.on("close", () => closed());
    });

    const started = Date.now();
    await expect(
      createBedrockProvider({ client: clientFor(endpoint), requestTimeoutMs: 100 }).analyze(
        IMAGE,
        "Describe it.",
        CLAUDE,
        undefined,
        64,
      ),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    await requestClosed;
  });

  it("is registered as bedrock, one instance for every lookup", async () => {
    const { getProvider } = await import("../providers/index.js");
    expect(getProvider("bedrock")).toBe(getProvider("bedrock"));
  });
});
