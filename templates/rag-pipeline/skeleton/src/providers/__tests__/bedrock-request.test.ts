/**
 * Tests for the requests the Bedrock providers build.
 *
 * Bedrock documents `temperature`, `top_p` and `top_k` per Claude model, so
 * the LLM sends no temperature to a Claude-compatible model id (a Claude id,
 * or one that names no family) and the configured one to any other, and none
 * at all when the configuration sets none. These verify the rule, its
 * lookalikes and its override against the Converse request on the wire, and
 * that an instance says once, at debug level, that it dropped a configured
 * temperature. The embedder is held to the Titan
 * request it builds and the response it accepts. The providers run the real
 * SDK client over a request handler that answers in-process, so the SDK
 * serializes, signs and parses every exchange as it does against Bedrock,
 * and no request leaves the process.
 */

import type { BedrockRuntimeClientConfig } from "@aws-sdk/client-bedrock-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { logger } from "../../logger.js";
import {
  BedrockEmbedder,
  BedrockLlm,
  bedrockLlmFromEnvironment,
  type SamplingParameters,
} from "../bedrock.js";
import { getLlmProvider } from "../registry.js";

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

  it.each(["auto", "send"] as const)(
    "sends no temperature to another family when the configuration sets none (%s)",
    async (samplingParameters) => {
      vi.stubEnv("LLM_TEMPERATURE", undefined);
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
    ["auto", { maxTokens: 512 }],
    ["", { maxTokens: 512 }],
  ])("reads samplingParameters from BEDROCK_SAMPLING_PARAMETERS=%o", async (value, config) => {
    vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", value);
    const { sent, client } = fakeBedrockRuntime(CONVERSE_REPLY);

    await bedrockLlmFromEnvironment(client).generate(
      "Answer.",
      "How do rollbacks work?",
      UNNAMED_FAMILY_IDS[0],
      0.1,
      512,
    );

    expect(sent[0].body.inferenceConfig).toEqual(config);
  });

  it("is the provider the registry builds for bedrock", () => {
    expect(getLlmProvider("bedrock")).toBeInstanceOf(BedrockLlm);
  });

  it("refuses a BEDROCK_SAMPLING_PARAMETERS value it does not know", () => {
    vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", "always");

    expect(() => getLlmProvider("bedrock")).toThrow(
      'BEDROCK_SAMPLING_PARAMETERS must be one of auto, send, omit, got "always"',
    );
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
    const embedder = new BedrockEmbedder("amazon.titan-embed-text-v2:0", 3, client);

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
    const embedder = new BedrockEmbedder("amazon.titan-embed-text-v2:0", 2, client);

    await expect(embedder.embedBatch(["first", "second"])).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(sent.map((request) => request.body.inputText)).toEqual(["first", "second"]);
  });

  it("rejects a response without an embedding", async () => {
    const { client } = fakeBedrockRuntime({ message: "throttled" });
    const embedder = new BedrockEmbedder("amazon.titan-embed-text-v2:0", 2, client);

    await expect(embedder.embed("rollbacks")).rejects.toThrow();
  });
});
