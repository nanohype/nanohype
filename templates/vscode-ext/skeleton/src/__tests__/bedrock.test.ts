import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer,
  type Http2ServerResponse,
  type Http2Session,
  type IncomingHttpHeaders,
} from "node:http2";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClientTarget,
  createBedrockProvider,
  DEFAULT_AWS_REGION,
  DEFAULT_BEDROCK_MODEL,
} from "../ai/providers/bedrock";
import type { ChatMessage } from "../ai/providers/types";

// ── Bedrock Request Tests ───────────────────────────────────────────
//
// The extension host's bedrock provider calls Converse through the AWS SDK
// under the credentials the SDK's chain resolves for the profile the
// awsProfile setting names, or its default chain. These run it against an
// HTTP/2 server listening in-process on the loopback interface, the
// protocol the SDK's default handler speaks to Bedrock, with session
// test credentials in the environment, so each assertion reads the request
// as Bedrock would receive it and no request leaves the machine. They hold
// the provider to the Converse path and body it sends, to signing with the
// chain's credentials rather than any provider key, to the profile, model
// and region the settings name, to failing on a refusal, and to the
// timeout every call runs under.
//

const conversation: ChatMessage[] = [
  { role: "user", content: "Say hello." },
  { role: "assistant", content: "Hello." },
  { role: "user", content: "Again." },
];

const REPLY = {
  output: {
    message: {
      role: "assistant",
      content: [{ text: "Hello." }, { text: " Bye." }],
    },
  },
  stopReason: "end_turn",
  usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
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
  return { endpoint: `http://127.0.0.1:${port}`, received, server };
}

/** A server that answers as Bedrock's Converse endpoint does. */
function converseServer(reply: object = REPLY) {
  return bedrockServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply));
  });
}

/** Session test credentials in the environment, where the default chain finds them first. */
function stubChainCredentials() {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDBEDROCKTEST");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "bedrock-test-secret");
  vi.stubEnv("AWS_SESSION_TOKEN", "bedrock-test-session");
  vi.stubEnv("AWS_PROFILE", "");
}

/** A client factory whose clients call `endpoint` on the default credential chain. */
function clientsFor(endpoint: string) {
  return (target: ClientTarget) =>
    new BedrockRuntimeClient({ region: target.region, endpoint, maxAttempts: 1 });
}

const tempDirs: string[] = [];

/**
 * An AWS config file holding `profile` with session test credentials, the
 * shape an IAM Identity Center sign-in or an assumed role resolves to,
 * selected for the SDK.
 */
function stubProfileConfig(profile: string, accessKeyId: string) {
  const dir = mkdtempSync(join(tmpdir(), "bedrock-test-"));
  tempDirs.push(dir);
  const config = join(dir, "config");
  writeFileSync(
    config,
    [
      `[profile ${profile}]`,
      `aws_access_key_id = ${accessKeyId}`,
      "aws_secret_access_key = profile-test-secret",
      "aws_session_token = profile-test-session",
      "",
    ].join("\n"),
  );
  vi.stubEnv("AWS_CONFIG_FILE", config);
  vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", join(dir, "credentials"));
  vi.stubEnv("AWS_ACCESS_KEY_ID", "");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
  vi.stubEnv("AWS_SESSION_TOKEN", "");
  vi.stubEnv("AWS_PROFILE", "");
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const session of sessions.splice(0)) session.destroy();
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("bedrock provider", () => {
  it("sends the conversation to Converse for the default inference profile and returns the reply's text", async () => {
    stubChainCredentials();
    const { endpoint, received } = await converseServer();

    const text = await createBedrockProvider({ createClient: clientsFor(endpoint) }).sendMessage(
      conversation,
      {},
    );

    expect(text).toBe("Hello. Bye.");
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(`/model/${encodeURIComponent(DEFAULT_BEDROCK_MODEL)}/converse`);
    expect(DEFAULT_BEDROCK_MODEL).toMatch(/^us\.anthropic\./);
    expect(request?.body).toEqual({
      messages: [
        { role: "user", content: [{ text: "Say hello." }] },
        { role: "assistant", content: [{ text: "Hello." }] },
        { role: "user", content: [{ text: "Again." }] },
      ],
      inferenceConfig: { maxTokens: 4096 },
    });
  });

  it("signs with the credentials the default chain resolves and sends no provider key", async () => {
    stubChainCredentials();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    const { endpoint, received } = await converseServer();

    await createBedrockProvider({ createClient: clientsFor(endpoint) }).sendMessage(
      conversation,
      {},
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

  it("signs with the profile awsProfile names, in the region awsRegion names", async () => {
    stubProfileConfig("bedrock-dev", "AKIDPROFILETEST");
    const { endpoint, received } = await converseServer();
    vi.stubEnv("AWS_ENDPOINT_URL_BEDROCK_RUNTIME", endpoint);
    vi.stubEnv("AWS_MAX_ATTEMPTS", "1");

    const text = await createBedrockProvider().sendMessage(conversation, {
      awsProfile: "bedrock-dev",
      awsRegion: SET_REGION,
    });

    expect(text).toBe("Hello. Bye.");
    expect(received[0]?.headers.authorization).toMatch(
      new RegExp(`^AWS4-HMAC-SHA256 Credential=AKIDPROFILETEST/\\d{8}/${SET_REGION}/bedrock/`),
    );
    expect(received[0]?.headers["x-amz-security-token"]).toBe("profile-test-session");
  });

  it("calls in AWS_REGION when awsRegion is unset, on the default chain when awsProfile is", async () => {
    stubChainCredentials();
    vi.stubEnv("AWS_REGION", SET_REGION);
    const { endpoint, received } = await converseServer();
    vi.stubEnv("AWS_ENDPOINT_URL_BEDROCK_RUNTIME", endpoint);
    vi.stubEnv("AWS_MAX_ATTEMPTS", "1");

    await createBedrockProvider().sendMessage(conversation, { awsProfile: "", awsRegion: "" });

    expect(received[0]?.headers.authorization).toMatch(
      new RegExp(`^AWS4-HMAC-SHA256 Credential=AKIDBEDROCKTEST/\\d{8}/${SET_REGION}/bedrock/`),
    );
  });

  it("builds one client for each profile and region, at its first call", async () => {
    stubChainCredentials();
    const { endpoint } = await converseServer();
    const build = vi.fn(clientsFor(endpoint));
    const provider = createBedrockProvider({ createClient: build });

    expect(build).not.toHaveBeenCalled();
    await provider.sendMessage(conversation, { awsProfile: "a", awsRegion: "us-east-1" });
    await provider.sendMessage(conversation, { awsProfile: "a", awsRegion: "us-east-1" });
    await provider.sendMessage(conversation, { awsProfile: "b", awsRegion: "us-east-1" });
    await provider.sendMessage(conversation, { awsProfile: "a", awsRegion: SET_REGION });

    expect(build.mock.calls.map(([target]) => target)).toEqual([
      { profile: "a", region: "us-east-1" },
      { profile: "b", region: "us-east-1" },
      { profile: "a", region: SET_REGION },
    ]);
  });

  it("names the model the settings give", async () => {
    stubChainCredentials();
    const { endpoint, received } = await converseServer();

    await createBedrockProvider({ createClient: clientsFor(endpoint) }).sendMessage(conversation, {
      model: "us.anthropic.claude-opus-5",
    });

    expect(received[0]?.url).toBe(
      `/model/${encodeURIComponent("us.anthropic.claude-opus-5")}/converse`,
    );
  });

  it("returns an empty string for a reply that carries no text block", async () => {
    stubChainCredentials();
    const { endpoint } = await converseServer({
      ...REPLY,
      output: { message: { role: "assistant", content: [] } },
    });

    expect(
      await createBedrockProvider({ createClient: clientsFor(endpoint) }).sendMessage(
        conversation,
        {},
      ),
    ).toBe("");
  });

  it("fails a refused request with Bedrock's error", async () => {
    stubChainCredentials();
    const { endpoint } = await bedrockServer((_req, res) => {
      res.writeHead(400, {
        "content-type": "application/json",
        "x-amzn-errortype": "ValidationException",
      });
      res.end(JSON.stringify({ message: "The provided model identifier is invalid." }));
    });

    await expect(
      createBedrockProvider({ createClient: clientsFor(endpoint) }).sendMessage(conversation, {}),
    ).rejects.toMatchObject({
      name: "ValidationException",
      message: "The provided model identifier is invalid.",
    });
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
      createBedrockProvider({
        createClient: clientsFor(endpoint),
        requestTimeoutMs: 100,
      }).sendMessage(conversation, {}),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    await requestClosed;
  });

  it("is registered as bedrock, one instance for every lookup", async () => {
    const { getProvider } = await import("../ai/providers/index");
    expect(getProvider("bedrock")).toBe(getProvider("bedrock"));
    expect(getProvider("bedrock").defaultModel).toBe(DEFAULT_BEDROCK_MODEL);
  });
});
