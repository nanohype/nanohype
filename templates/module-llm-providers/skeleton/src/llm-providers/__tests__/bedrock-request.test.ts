import { Readable } from "node:stream";
import { crc32 } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
import {
  type BedrockProviderOptions,
  createBedrockProvider,
  parseSamplingParameters,
} from "../providers/bedrock.js";
import { RequestTimeoutError } from "../resilience/request-timeout.js";
import type { ChatMessage, ChatOptions, StreamResponse } from "../types.js";
import {
  type Behaviour,
  CONTRACT_TIMEOUT_MS,
  describeProviderContract,
  type Endpoint,
} from "./provider-contract.js";

// ── Bedrock Request Tests ──────────────────────────────────────────
//
// Bedrock documents `temperature`, `top_p` and `top_k` per Claude model,
// and no single rule over provider-neutral options meets all of them, so
// the provider sends none to a Claude-compatible model id (a Claude id,
// or one that names no family) and the caller's values to any other.
// These verify the rule, its lookalikes and its overrides against the
// Converse and ConverseStream requests on the wire, that the `sampling`
// hook declares what a request carries, that an instance says once, at
// debug level, that it dropped the caller's values, and that the
// registered provider reads its override as its module loads. They also
// hold both request modes to LLM_REQUEST_TIMEOUT_MS, and run the provider
// under the breaker and timeout contract provider-contract.ts gives. The
// provider runs
// the real SDK client over a request handler that answers in-process, a
// JSON body for Converse and an event stream for ConverseStream, or
// nothing at all, so the SDK serializes, signs and parses every exchange
// as it does against Bedrock, and no request leaves the process.
//

const CLAUDE_MODEL_IDS = [
  "us.anthropic.claude-sonnet-5",
  "global.anthropic.claude-opus-5",
  "anthropic.claude-sonnet-5",
  "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-5",
  "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-5",
];

// Model ids that name no family: the provider cannot tell Claude from any
// other model behind them.
const UNNAMED_FAMILY_IDS = [
  "arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/a1b2c3d4e5f6",
  "arn:aws:bedrock:us-east-1:123456789012:provisioned-model/a1b2c3d4e5f6",
  "arn:aws:bedrock:us-east-1:123456789012:imported-model/a1b2c3d4e5f6",
  "arn:aws:bedrock:us-east-1:123456789012:custom-model/amazon.nova-pro-v1:0/a1b2c3d4e5f6",
  "arn:aws:bedrock:us-east-1:123456789012:custom-model-deployment/a1b2c3d4e5f6",
  "a1b2c3d4e5f6",
];

// Model ids of other families, including ones that carry "anthropic"
// somewhere other than the provider segment.
const OTHER_FAMILY_IDS = [
  "meta.llama3-3-70b-instruct-v1:0",
  "us.amazon.nova-pro-v1:0",
  "arn:aws:bedrock:us-east-1::foundation-model/meta.llama3-3-70b-instruct-v1:0",
  "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.amazon.nova-pro-v1:0",
  "acme.anthropic-tuned-v1:0",
  "acme.distilled-anthropic.v1:0",
  "arn:aws:bedrock:us-east-1::foundation-model/acme.anthropic-tuned-v1:0",
];

const DROPPED = "bedrock sends no sampling options to this model";

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

function withModel(model: string): ChatOptions {
  return { model, maxTokens: 64, temperature: 0.2, topP: 0.9, stop: ["\n\n"] };
}

/** One event-stream frame: an `:event-type` event carrying `payload` as JSON. */
function eventFrame(eventType: string, payload: unknown): Buffer {
  const header = (name: string, value: string): Buffer => {
    const nameBytes = Buffer.from(name);
    const valueBytes = Buffer.from(value);
    const out = Buffer.alloc(4 + nameBytes.length + valueBytes.length);
    out.writeUInt8(nameBytes.length, 0);
    nameBytes.copy(out, 1);
    out.writeUInt8(7, 1 + nameBytes.length); // 7: string value
    out.writeUInt16BE(valueBytes.length, 2 + nameBytes.length);
    valueBytes.copy(out, 4 + nameBytes.length);
    return out;
  };
  const headers = Buffer.concat([
    header(":event-type", eventType),
    header(":content-type", "application/json"),
    header(":message-type", "event"),
  ]);
  const body = Buffer.from(JSON.stringify(payload));
  const prelude = Buffer.alloc(8);
  prelude.writeUInt32BE(12 + headers.length + body.length + 4, 0);
  prelude.writeUInt32BE(headers.length, 4);
  const preludeCrc = Buffer.alloc(4);
  preludeCrc.writeUInt32BE(crc32(prelude), 0);
  const message = Buffer.concat([prelude, preludeCrc, headers, body]);
  const messageCrc = Buffer.alloc(4);
  messageCrc.writeUInt32BE(crc32(message), 0);
  return Buffer.concat([message, messageCrc]);
}

interface SentConverse {
  operation: string;
  modelId: string;
  body: { inferenceConfig?: Record<string, unknown>; [field: string]: unknown };
}

/** A Bedrock runtime that answers Converse and ConverseStream with one text message. */
function fakeBedrockRuntime(options: Omit<BedrockProviderOptions, "client"> = {}) {
  const sent: SentConverse[] = [];
  const usage = { inputTokens: 12, outputTokens: 3, totalTokens: 15 };
  const provider = createBedrockProvider({
    ...options,
    client: {
      region: "us-east-1",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "test-secret" },
      requestHandler: {
        async handle(request: { path: string; body?: unknown }) {
          const [, , modelId, operation] = request.path.split("/");
          const body =
            request.body instanceof Uint8Array
              ? new TextDecoder().decode(request.body)
              : String(request.body);
          sent.push({ operation, modelId: decodeURIComponent(modelId), body: JSON.parse(body) });
          if (operation === "converse-stream") {
            return {
              response: {
                statusCode: 200,
                headers: { "content-type": "application/vnd.amazon.eventstream" },
                body: Readable.from([
                  eventFrame("messageStart", { role: "assistant" }),
                  eventFrame("contentBlockDelta", {
                    contentBlockIndex: 0,
                    delta: { text: "Hello." },
                  }),
                  eventFrame("contentBlockStop", { contentBlockIndex: 0 }),
                  eventFrame("messageStop", { stopReason: "end_turn" }),
                  eventFrame("metadata", { usage, metrics: { latencyMs: 5 } }),
                ]),
              },
            };
          }
          const reply = {
            output: { message: { role: "assistant", content: [{ text: "Hello." }] } },
            stopReason: "end_turn",
            usage,
            metrics: { latencyMs: 5 },
          };
          return {
            response: {
              statusCode: 200,
              headers: { "content-type": "application/json" },
              body: new TextEncoder().encode(JSON.stringify(reply)),
            },
          };
        },
      },
    },
  });
  return { sent, provider };
}

async function drain(response: StreamResponse): Promise<string> {
  const text: string[] = [];
  for await (const chunk of response) {
    text.push(chunk.text);
  }
  return text.join("");
}

describe("bedrock provider request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([...CLAUDE_MODEL_IDS, ...UNNAMED_FAMILY_IDS])(
    "chat sends no sampling parameters to %s",
    async (model) => {
      const { sent, provider } = fakeBedrockRuntime();

      const response = await provider.chat(messages, withModel(model));

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        operation: "converse",
        modelId: model,
        body: {
          system: [{ text: "Answer briefly." }, { cachePoint: { type: "default" } }],
          messages: [{ role: "user", content: [{ text: "Say hello." }] }],
        },
      });
      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64, stopSequences: ["\n\n"] });
      expect(provider.sampling?.(withModel(model))).toEqual({});
      expect(response).toMatchObject({ text: "Hello.", usage: { inputTokens: 12 } });
    },
  );

  it.each(OTHER_FAMILY_IDS)("chat sends the caller's values to %s", async (model) => {
    const { sent, provider } = fakeBedrockRuntime();

    await provider.chat(messages, withModel(model));

    expect(sent[0].modelId).toBe(model);
    expect(sent[0].body.inferenceConfig).toEqual({
      maxTokens: 64,
      temperature: 0.2,
      topP: 0.9,
      stopSequences: ["\n\n"],
    });
    expect(provider.sampling?.(withModel(model))).toEqual({ temperature: 0.2, topP: 0.9 });
  });

  it("chat sends no sampling parameters to the default model", async () => {
    const { sent, provider } = fakeBedrockRuntime();

    await provider.chat(messages, { maxTokens: 64, temperature: 0.2, topP: 0.9 });

    expect(sent[0].modelId).toBe("us.anthropic.claude-sonnet-5");
    expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64 });
  });

  it("streamChat sends no sampling parameters to a Claude model", async () => {
    const { sent, provider } = fakeBedrockRuntime();

    const response = provider.streamChat(messages, withModel("us.anthropic.claude-sonnet-5"));

    expect(await drain(response)).toBe("Hello.");
    expect(sent[0].operation).toBe("converse-stream");
    expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64, stopSequences: ["\n\n"] });
    await expect(response.response).resolves.toMatchObject({
      text: "Hello.",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("streamChat sends the caller's values to a model outside the Claude family", async () => {
    const { sent, provider } = fakeBedrockRuntime();

    const response = provider.streamChat(messages, withModel("meta.llama3-3-70b-instruct-v1:0"));

    expect(await drain(response)).toBe("Hello.");
    expect(sent[0].body.inferenceConfig).toEqual({
      maxTokens: 64,
      temperature: 0.2,
      topP: 0.9,
      stopSequences: ["\n\n"],
    });
  });

  it("streamChat sends the caller's values to a model id that names no family under send", async () => {
    const { sent, provider } = fakeBedrockRuntime({ samplingParameters: "send" });

    const response = provider.streamChat(messages, withModel(UNNAMED_FAMILY_IDS[0]));

    expect(await drain(response)).toBe("Hello.");
    expect(sent[0].operation).toBe("converse-stream");
    expect(sent[0].body.inferenceConfig).toEqual({
      maxTokens: 64,
      temperature: 0.2,
      topP: 0.9,
      stopSequences: ["\n\n"],
    });
  });

  it("streamChat sends no sampling parameters to another family under omit", async () => {
    const { sent, provider } = fakeBedrockRuntime({ samplingParameters: "omit" });

    const response = provider.streamChat(messages, withModel(OTHER_FAMILY_IDS[0]));

    expect(await drain(response)).toBe("Hello.");
    expect(sent[0].operation).toBe("converse-stream");
    expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64, stopSequences: ["\n\n"] });
  });

  it.each(UNNAMED_FAMILY_IDS)(
    "sends the caller's values to %s when samplingParameters is send",
    async (model) => {
      const { sent, provider } = fakeBedrockRuntime({ samplingParameters: "send" });

      await provider.chat(messages, withModel(model));

      expect(sent[0].body.inferenceConfig).toEqual({
        maxTokens: 64,
        temperature: 0.2,
        topP: 0.9,
        stopSequences: ["\n\n"],
      });
    },
  );

  it.each(OTHER_FAMILY_IDS)(
    "sends no sampling parameters to %s when samplingParameters is omit",
    async (model) => {
      const { sent, provider } = fakeBedrockRuntime({ samplingParameters: "omit" });

      await provider.chat(messages, withModel(model));

      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64, stopSequences: ["\n\n"] });
      expect(provider.sampling?.(withModel(model))).toEqual({});
    },
  );

  it("says once per instance, at debug level, that it dropped them", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () => debug.mock.calls.filter(([message]) => message === DROPPED);
    const { provider } = fakeBedrockRuntime();

    await provider.chat(messages, withModel("us.anthropic.claude-sonnet-5"));
    await provider.chat(messages, withModel("us.anthropic.claude-sonnet-5"));
    expect(dropped()).toEqual([
      [DROPPED, { model: "us.anthropic.claude-sonnet-5", temperature: 0.2, topP: 0.9 }],
    ]);

    await fakeBedrockRuntime().provider.chat(messages, withModel(UNNAMED_FAMILY_IDS[0]));
    expect(dropped()).toHaveLength(2);
  });

  it("says nothing when it drops nothing the caller set", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () => debug.mock.calls.filter(([message]) => message === DROPPED);

    await fakeBedrockRuntime().provider.chat(messages, { model: "us.anthropic.claude-sonnet-5" });
    await fakeBedrockRuntime().provider.chat(messages, withModel(OTHER_FAMILY_IDS[0]));
    await fakeBedrockRuntime({ samplingParameters: "send" }).provider.chat(
      messages,
      withModel(UNNAMED_FAMILY_IDS[0]),
    );

    expect(dropped()).toEqual([]);
  });
});

describe("BEDROCK_SAMPLING_PARAMETERS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["send", { temperature: 0.2, topP: 0.9 }],
    ["auto", {}],
  ])(
    "sets what the registered provider sends to an ARN that names no family: %s",
    async (value, sent) => {
      vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", value);
      // The registered provider reads the variable once, when its module loads.
      vi.resetModules();
      await import("../providers/bedrock.js");
      const { getProvider } = await import("../providers/registry.js");

      expect(getProvider("bedrock").sampling?.(withModel(UNNAMED_FAMILY_IDS[0]))).toEqual(sent);
    },
  );

  it("fails the import of the registered provider on a value it does not know", async () => {
    vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", "always");
    vi.resetModules();

    await expect(import("../providers/bedrock.js")).rejects.toThrow(
      'BEDROCK_SAMPLING_PARAMETERS must be one of auto, send, omit, got "always"',
    );
  });

  it.each([
    [undefined, "auto"],
    ["", "auto"],
    ["auto", "auto"],
    ["send", "send"],
    ["omit", "omit"],
  ])("reads %o as %s", (value, mode) => {
    expect(parseSamplingParameters(value)).toBe(mode);
  });

  it("refuses any other value", () => {
    expect(() => parseSamplingParameters("always")).toThrow(
      'BEDROCK_SAMPLING_PARAMETERS must be one of auto, send, omit, got "always"',
    );
  });
});

/**
 * A Bedrock provider over a request handler that answers nothing, as a
 * hung connection does, until its request aborts. It keeps whether each
 * request's signal fired.
 */
function hungBedrockRuntime(create: typeof createBedrockProvider = createBedrockProvider) {
  const aborted: boolean[] = [];
  const provider = create({
    client: {
      region: "us-east-1",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "test-secret" },
      maxAttempts: 1,
      requestHandler: {
        handle(_request: unknown, options?: { abortSignal?: AbortSignal }) {
          const index = aborted.push(false) - 1;
          return new Promise<never>((_resolve, reject) => {
            options?.abortSignal?.addEventListener("abort", () => {
              aborted[index] = true;
              reject(options.abortSignal?.reason);
            });
          });
        },
      },
    },
  });
  return { aborted, provider };
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

/**
 * Waits, on the real event loop, until `count` requests reach the handler:
 * the SDK can read its configuration from disk before it sends, which fake
 * timers do not wait for. The fake clock stands still meanwhile.
 */
async function untilSent(aborted: boolean[], count: number): Promise<void> {
  while (aborted.length < count) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("bedrock provider request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("gives up on a request at 120 seconds by default, in both request modes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, provider } = hungBedrockRuntime();

    const chat = track(provider.chat(messages));
    const stream = track(drain(provider.streamChat(messages)));
    await untilSent(aborted, 2);

    await vi.advanceTimersByTimeAsync(119_999);
    expect(chat.outcome).toBe("waiting");
    expect(stream.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(stream.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(aborted).toEqual([true, true]);
  });

  it("takes LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import("../providers/bedrock.js");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, provider } = hungBedrockRuntime(fresh.createBedrockProvider);

    const chat = track(provider.chat(messages));
    await untilSent(aborted, 1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(chat.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toMatchObject({ name: "RequestTimeoutError", timeoutMs: 5_000 });
  });
});

/**
 * A Bedrock runtime request handler that behaves as `behaviour` says: a
 * ConverseStream request gets a `messageStart` event and then nothing until
 * its signal aborts, a Converse request gets no answer until then, and a
 * refused request gets a 400 ValidationException.
 */
function contractRuntime(behaviour: Behaviour) {
  const endpoint: Endpoint = { requests: 0, aborted: false };
  const requestHandler = {
    async handle(request: { path: string }, options?: { abortSignal?: AbortSignal }) {
      endpoint.requests += 1;
      if (behaviour === "refuses") {
        return {
          response: {
            statusCode: 400,
            headers: {
              "content-type": "application/json",
              "x-amzn-errortype": "ValidationException",
            },
            body: new TextEncoder().encode(JSON.stringify({ message: "refused" })),
          },
        };
      }
      const signal = options?.abortSignal;
      if (!request.path.endsWith("/converse-stream")) {
        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            endpoint.aborted = true;
            reject(signal.reason);
          });
        });
      }
      const body = new Readable({ read() {} });
      body.push(eventFrame("messageStart", { role: "assistant" }));
      signal?.addEventListener("abort", () => {
        endpoint.aborted = true;
        body.destroy(signal.reason as Error);
      });
      return {
        response: {
          statusCode: 200,
          headers: { "content-type": "application/vnd.amazon.eventstream" },
          body,
        },
      };
    },
  };
  return { endpoint, requestHandler };
}

describeProviderContract("bedrock", {
  create(behaviour) {
    const { endpoint, requestHandler } = contractRuntime(behaviour);
    const provider = createBedrockProvider({
      requestTimeoutMs: CONTRACT_TIMEOUT_MS,
      client: {
        region: "us-east-1",
        credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "test-secret" },
        maxAttempts: 1,
        requestHandler,
      },
    });
    return { endpoint, provider };
  },
  ChatTimeoutError: RequestTimeoutError,
  dropsConnection: true,
});
