/**
 * Tests for the requests the Bedrock providers build.
 *
 * Bedrock documents `temperature`, `top_p` and `top_k` per Claude model, so
 * the LLM sends no temperature to a Claude-compatible model id (a Claude id,
 * or one that names no family) and the configured one to any other, and none
 * at all when the configuration sets none. These verify the rule, its
 * lookalikes and its overrides against the Converse request on the wire, that
 * the configuration carries BEDROCK_SAMPLING_PARAMETERS to the provider
 * generation builds, and that an instance says once, at debug level, that it
 * dropped a configured temperature. The embedder is held to the Titan request
 * it builds and the response it accepts. Both are held to giving up on a call,
 * and aborting its request, at the request timeout they are built with. The
 * providers run the real SDK client over a request handler that answers
 * in-process, so the SDK serializes, signs and parses every exchange as it
 * does against Bedrock, and no request leaves the process; the timeout tests
 * run on fake timers.
 */

import { type AddressInfo, createServer, type Socket } from "node:net";
import type { BedrockRuntimeClientConfig } from "@aws-sdk/client-bedrock-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { loadConfig } from "../../config.js";
import { generate } from "../../generation.js";
import { logger } from "../../logger.js";
import { RequestTimeoutError } from "../../resilience/request-timeout.js";
import { BedrockEmbedder, BedrockLlm } from "../bedrock.js";
import { getEmbeddingProvider, getLlmProvider, registerLlmProvider } from "../registry.js";
import type { LlmProviderSettings, SamplingParameters } from "../types.js";

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
  "amazon.nova-pro-v1:0",
  "us.meta.llama3-3-70b-instruct-v1:0",
  "arn:aws:bedrock:us-east-1::foundation-model/meta.llama3-3-70b-instruct-v1:0",
  "acme.anthropic-tuned-v1:0",
  "acme.distilled-anthropic.v1:0",
];

const DROPPED = "bedrock sends no temperature to this model";

interface SentRequest {
  operation: string;
  modelId: string;
  body: Record<string, unknown>;
}

/**
 * SDK client configuration whose requests a Bedrock runtime answers
 * in-process, each with the next of `replies` (the last one repeats).
 */
function fakeBedrockRuntime(...replies: unknown[]) {
  const sent: SentRequest[] = [];
  const client: BedrockRuntimeClientConfig = {
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
        const reply = replies[Math.min(sent.length, replies.length) - 1];
        return {
          response: {
            statusCode: 200,
            headers: { "content-type": "application/json" },
            body: new TextEncoder().encode(JSON.stringify(reply)),
          },
        };
      },
    },
  };
  return { sent, client };
}

const CONVERSE_REPLY = {
  output: {
    message: { role: "assistant", content: [{ text: "Rollbacks restore the previous release." }] },
  },
  stopReason: "end_turn",
  usage: {
    inputTokens: 40,
    outputTokens: 8,
    totalTokens: 48,
    cacheReadInputTokens: 30,
    cacheWriteInputTokens: 0,
  },
  metrics: { latencyMs: 5 },
};

/** A Bedrock LLM over an in-process runtime, and the requests it sends. */
function llmOverFakeRuntime(samplingParameters?: SamplingParameters) {
  const { sent, client } = fakeBedrockRuntime(CONVERSE_REPLY);
  return { sent, llm: new BedrockLlm({ samplingParameters, client }) };
}

describe("bedrock llm request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends the Converse request with a cache point after the system prompt", async () => {
    const { sent, llm } = llmOverFakeRuntime();

    const result = await llm.generate(
      "Answer from the context.",
      "How do rollbacks work?",
      "us.anthropic.claude-sonnet-5",
      0.1,
      512,
    );

    expect(sent).toEqual([
      {
        operation: "converse",
        modelId: "us.anthropic.claude-sonnet-5",
        body: {
          system: [{ text: "Answer from the context." }, { cachePoint: { type: "default" } }],
          messages: [{ role: "user", content: [{ text: "How do rollbacks work?" }] }],
          inferenceConfig: { maxTokens: 512 },
        },
      },
    ]);
    expect(result).toEqual({
      answer: "Rollbacks restore the previous release.",
      usage: {
        input_tokens: 40,
        output_tokens: 8,
        total_tokens: 48,
        cache_read_tokens: 30,
        cache_write_tokens: 0,
      },
    });
  });

  it.each([...CLAUDE_MODEL_IDS, ...UNNAMED_FAMILY_IDS])(
    "sends no temperature to %s",
    async (model) => {
      const { sent, llm } = llmOverFakeRuntime();

      await llm.generate("Answer.", "How do rollbacks work?", model, 0.1, 512);

      expect(sent[0].modelId).toBe(model);
      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 512 });
    },
  );

  it.each(OTHER_FAMILY_IDS)("sends the configured temperature to %s", async (model) => {
    const { sent, llm } = llmOverFakeRuntime();

    await llm.generate("Answer.", "How do rollbacks work?", model, 0.1, 512);

    expect(sent[0].modelId).toBe(model);
    expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 512, temperature: 0.1 });
  });

  it.each([
    [undefined, "auto"],
    [undefined, "send"],
    ["", "auto"],
    ["", "send"],
  ] as const)(
    "sends no temperature to another family when LLM_TEMPERATURE is %o (%s)",
    async (value, samplingParameters) => {
      vi.stubEnv("LLM_TEMPERATURE", value);
      const { temperature } = loadConfig().generation;
      const { sent, llm } = llmOverFakeRuntime(samplingParameters);

      await llm.generate(
        "Answer.",
        "How do rollbacks work?",
        "amazon.nova-pro-v1:0",
        temperature,
        512,
      );

      expect(temperature).toBeUndefined();
      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 512 });
    },
  );

  it.each(UNNAMED_FAMILY_IDS)(
    "sends the configured temperature to %s when samplingParameters is send",
    async (model) => {
      const { sent, llm } = llmOverFakeRuntime("send");

      await llm.generate("Answer.", "How do rollbacks work?", model, 0.1, 512);

      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 512, temperature: 0.1 });
    },
  );

  it.each(OTHER_FAMILY_IDS)(
    "sends no temperature to %s when samplingParameters is omit",
    async (model) => {
      const { sent, llm } = llmOverFakeRuntime("omit");

      await llm.generate("Answer.", "How do rollbacks work?", model, 0.1, 512);

      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 512 });
    },
  );

  it.each([
    ["send", { maxTokens: 512, temperature: 0.1 }],
    ["omit", { maxTokens: 512 }],
    ["auto", { maxTokens: 512 }],
    ["", { maxTokens: 512 }],
    [undefined, { maxTokens: 512 }],
  ])(
    "sends what BEDROCK_SAMPLING_PARAMETERS=%o sets, read through the configuration",
    async (value, inferenceConfig) => {
      vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", value);
      const { bedrockSamplingParameters } = loadConfig().generation;
      const { sent, client } = fakeBedrockRuntime(CONVERSE_REPLY);
      const llm = new BedrockLlm({ samplingParameters: bedrockSamplingParameters, client });

      await llm.generate("Answer.", "How do rollbacks work?", UNNAMED_FAMILY_IDS[0], 0.1, 512);

      expect(sent[0].body.inferenceConfig).toEqual(inferenceConfig);
    },
  );

  it("hands the configured samplingParameters to the provider generation builds", async () => {
    vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", "send");
    const built: LlmProviderSettings[] = [];
    registerLlmProvider("bedrock-options-probe", (settings) => {
      built.push(settings);
      return { generate: async () => ({ answer: "", usage: {} }) };
    });
    const config = loadConfig();

    await generate("How do rollbacks work?", [], {
      ...config,
      generation: { ...config.generation, provider: "bedrock-options-probe" },
    });

    expect(built).toEqual([expect.objectContaining({ samplingParameters: "send" })]);
  });

  it("is the provider the registry builds for bedrock", () => {
    expect(getLlmProvider("bedrock")).toBeInstanceOf(BedrockLlm);
  });

  it("refuses a BEDROCK_SAMPLING_PARAMETERS value it does not know as the configuration loads", () => {
    vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", "always");

    let refused: unknown;
    try {
      loadConfig();
    } catch (error) {
      refused = error;
    }

    expect(refused).toBeInstanceOf(ZodError);
    expect((refused as ZodError).issues).toEqual([
      expect.objectContaining({
        path: ["generation", "bedrockSamplingParameters"],
        message: 'BEDROCK_SAMPLING_PARAMETERS must be one of auto, send, omit, got "always"',
      }),
    ]);
  });

  it("says once per instance, at debug level, that it dropped the temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () => debug.mock.calls.filter(([message]) => message === DROPPED);
    const model = "us.anthropic.claude-sonnet-5";
    const { llm } = llmOverFakeRuntime();

    await llm.generate("Answer.", "First question?", model, 0.1, 512);
    await llm.generate("Answer.", "Second question?", model, 0.1, 512);
    expect(dropped()).toEqual([[DROPPED, { model, temperature: 0.1 }]]);

    await llmOverFakeRuntime().llm.generate("Answer.", "Third?", model, 0.1, 512);
    expect(dropped()).toHaveLength(2);
  });

  it("says nothing when it drops no configured temperature", async () => {
    const debug = vi.spyOn(logger, "debug");

    await llmOverFakeRuntime().llm.generate(
      "Answer.",
      "First question?",
      "us.anthropic.claude-sonnet-5",
      undefined,
      512,
    );
    await llmOverFakeRuntime().llm.generate(
      "Answer.",
      "Second question?",
      "amazon.nova-pro-v1:0",
      0.1,
      512,
    );

    expect(debug.mock.calls.filter(([message]) => message === DROPPED)).toEqual([]);
  });
});

describe("bedrock embedder request", () => {
  it("asks Titan for a normalized embedding of the configured width", async () => {
    const { sent, client } = fakeBedrockRuntime({ embedding: [0.1, 0.2, 0.3] });
    const embedder = new BedrockEmbedder({
      model: "amazon.titan-embed-text-v2:0",
      dimensions: 3,
      client,
    });

    expect(embedder.dimensions).toBe(3);
    await expect(embedder.embed("rollbacks")).resolves.toEqual([0.1, 0.2, 0.3]);

    expect(sent).toEqual([
      {
        operation: "invoke",
        modelId: "amazon.titan-embed-text-v2:0",
        body: { inputText: "rollbacks", dimensions: 3, normalize: true },
      },
    ]);
  });

  it("embeds a batch one input per call, in order", async () => {
    const { sent, client } = fakeBedrockRuntime({ embedding: [1, 0] }, { embedding: [0, 1] });
    const embedder = new BedrockEmbedder({
      model: "amazon.titan-embed-text-v2:0",
      dimensions: 2,
      client,
    });

    await expect(embedder.embedBatch(["first", "second"])).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(sent.map((request) => request.body.inputText)).toEqual(["first", "second"]);
  });

  it("refuses a response without an embedding at its schema", async () => {
    const { sent, client } = fakeBedrockRuntime({ message: "throttled" });
    const embedder = new BedrockEmbedder({
      model: "amazon.titan-embed-text-v2:0",
      dimensions: 2,
      client,
    });

    const refused = await embedder.embed("rollbacks").catch((error: unknown) => error);

    expect(sent).toHaveLength(1);
    expect(refused).toBeInstanceOf(ZodError);
    expect((refused as ZodError).issues).toEqual([
      expect.objectContaining({ path: ["embedding"], code: "invalid_type" }),
    ]);
  });
});

/**
 * SDK client configuration over a Bedrock runtime that answers nothing, as a
 * hung connection does, until the request aborts. It keeps whether each
 * request's signal fired.
 */
function hungBedrockRuntime() {
  const aborted: boolean[] = [];
  const client: BedrockRuntimeClientConfig = {
    region: "us-east-1",
    credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "test-secret" },
    maxAttempts: 1,
    requestHandler: {
      handle(_request: unknown, options?: { abortSignal?: AbortSignal }) {
        const index = aborted.push(false) - 1;
        return new Promise((_resolve, reject) => {
          const signal = options?.abortSignal;
          signal?.addEventListener("abort", () => {
            aborted[index] = true;
            reject(signal.reason);
          });
        });
      },
    },
  };
  return { aborted, client };
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
 * Waits, on the real event loop, until `sent()` reaches `count`: the SDK can
 * read its configuration from disk before it sends, which fake timers do not
 * wait for. The fake clock stands still meanwhile.
 */
async function untilSent(sent: () => number, count: number): Promise<void> {
  while (sent() < count) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("bedrock request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up on an llm call at the request timeout it is built with", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, client } = hungBedrockRuntime();
    const llm = new BedrockLlm({ requestTimeoutMs: 5_000, client });

    const answer = track(
      llm.generate("Answer.", "How?", "us.anthropic.claude-sonnet-5", undefined, 512),
    );
    await untilSent(() => aborted.length, 1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(answer.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(answer.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(aborted).toEqual([true]);
  });

  it("gives up on an embedding call at the request timeout it is built with", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, client } = hungBedrockRuntime();
    const embedder = new BedrockEmbedder({ requestTimeoutMs: 5_000, client });

    const embedding = track(embedder.embed("rollbacks"));
    await untilSent(() => aborted.length, 1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(embedding.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(embedding.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(aborted).toEqual([true]);
  });

  it("gives up on a call at 120 seconds when built without a timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, client } = hungBedrockRuntime();
    const llm = new BedrockLlm({ client });

    const answer = track(
      llm.generate("Answer.", "How?", "us.anthropic.claude-sonnet-5", undefined, 512),
    );
    await untilSent(() => aborted.length, 1);

    await vi.advanceTimersByTimeAsync(119_999);
    expect(answer.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(answer.outcome).toBeInstanceOf(RequestTimeoutError);
  });

  it("builds the registered providers with the request timeout they are handed", async () => {
    // A local endpoint that accepts each connection and never answers it.
    const sockets = new Set<Socket>();
    const server = createServer((socket) => sockets.add(socket));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    vi.stubEnv("AWS_ENDPOINT_URL_BEDROCK_RUNTIME", `http://127.0.0.1:${port}`);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDTEST");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("AWS_REGION", "us-east-1");
    try {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const llm = getLlmProvider("bedrock", { requestTimeoutMs: 5_000 });
      const embedder = getEmbeddingProvider("bedrock", { dimensions: 2, requestTimeoutMs: 5_000 });

      const answer = track(
        llm.generate("Answer.", "How?", "us.anthropic.claude-sonnet-5", undefined, 512),
      );
      const embedding = track(embedder.embed("rollbacks"));
      await untilSent(() => sockets.size, 2);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(answer.outcome).toBe("waiting");
      expect(embedding.outcome).toBe("waiting");

      await vi.advanceTimersByTimeAsync(1);
      expect(answer.outcome).toBeInstanceOf(RequestTimeoutError);
      expect(embedding.outcome).toBeInstanceOf(RequestTimeoutError);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      vi.unstubAllEnvs();
    }
  });
});
