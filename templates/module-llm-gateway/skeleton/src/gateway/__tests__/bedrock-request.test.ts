import { afterEach, describe, expect, it, vi } from "vitest";
import { createGateway } from "../index.js";
import {
  type BedrockProviderOptions,
  createBedrockProvider,
  parseSamplingParameters,
} from "../providers/bedrock.js";
import { registerProvider } from "../providers/registry.js";
import { RequestTimeoutError } from "../providers/request-timeout.js";
import type { ChatOptions } from "../types.js";

// ── Bedrock Request Tests ───────────────────────────────────────────
//
// Bedrock documents `temperature`, `top_p` and `top_k` per Claude model,
// and no single rule over provider-neutral options meets all of them, so
// the provider sends none to a Claude-compatible model id (a Claude id,
// or one that names no family) and the caller's temperature to any other.
// These verify the rule, its lookalikes and its override against the
// Converse request on the wire, that the `sampling` hook declares what
// the request carries, and that a gateway's response cache follows it.
// They also hold a call to LLM_REQUEST_TIMEOUT_MS, or the provider's own
// requestTimeoutMs. The provider runs the real SDK client over a request
// handler that answers in-process, or never answers, so the SDK
// serializes and signs every request as it does against Bedrock, and no
// request leaves the process.
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
  "amazon.nova-pro-v1:0",
  "us.meta.llama3-3-70b-instruct-v1:0",
  "arn:aws:bedrock:us-east-1::foundation-model/meta.llama3-3-70b-instruct-v1:0",
  "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.amazon.nova-pro-v1:0",
  "acme.anthropic-tuned-v1:0",
  "acme.distilled-anthropic.v1:0",
  "arn:aws:bedrock:us-east-1::foundation-model/acme.anthropic-tuned-v1:0",
];

interface SentConverse {
  modelId: string;
  body: { inferenceConfig?: Record<string, unknown>; [field: string]: unknown };
}

/** A Bedrock runtime that answers every Converse request with one text message. */
function fakeBedrockRuntime(options: Omit<BedrockProviderOptions, "client"> = {}) {
  const sent: SentConverse[] = [];
  const reply = {
    output: { message: { role: "assistant", content: [{ text: "Hello." }] } },
    stopReason: "end_turn",
    usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    metrics: { latencyMs: 5 },
  };
  const provider = createBedrockProvider({
    ...options,
    client: {
      region: "us-east-1",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "test-secret" },
      requestHandler: {
        async handle(request: { path: string; body?: unknown }) {
          const body =
            request.body instanceof Uint8Array
              ? new TextDecoder().decode(request.body)
              : String(request.body);
          sent.push({
            modelId: decodeURIComponent(request.path.split("/")[2]),
            body: JSON.parse(body),
          });
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

const SAY_HELLO = [{ role: "user" as const, content: "Say hello." }];

describe("bedrock provider request", () => {
  it.each([...CLAUDE_MODEL_IDS, ...UNNAMED_FAMILY_IDS])(
    "sends no sampling parameters to %s",
    async (model) => {
      const { sent, provider } = fakeBedrockRuntime();
      const opts: ChatOptions = { model, maxTokens: 64, temperature: 0.2 };

      await provider.chat(SAY_HELLO, opts);

      expect(sent).toHaveLength(1);
      expect(sent[0].modelId).toBe(model);
      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64 });
      expect(provider.sampling?.(opts)).toEqual({});
    },
  );

  it.each(OTHER_FAMILY_IDS)("sends the caller's temperature to %s", async (model) => {
    const { sent, provider } = fakeBedrockRuntime();
    const opts: ChatOptions = { model, maxTokens: 64, temperature: 0.2 };

    await provider.chat(SAY_HELLO, opts);

    expect(sent[0].modelId).toBe(model);
    expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64, temperature: 0.2 });
    expect(provider.sampling?.(opts)).toEqual({ temperature: 0.2 });
  });

  it("sends no sampling parameters to the default model", async () => {
    const { sent, provider } = fakeBedrockRuntime();

    await provider.chat(SAY_HELLO, { maxTokens: 64, temperature: 0.2 });

    expect(sent[0].modelId).toBe("us.anthropic.claude-sonnet-5");
    expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64 });
  });

  it("puts the system prompt and its cache point beside the conversation", async () => {
    const { sent, provider } = fakeBedrockRuntime();

    const response = await provider.chat(
      [{ role: "system", content: "Answer briefly." }, ...SAY_HELLO],
      { model: "amazon.nova-pro-v1:0", maxTokens: 64 },
    );

    expect(sent[0].body).toEqual({
      system: [{ text: "Answer briefly." }, { cachePoint: { type: "default" } }],
      messages: [{ role: "user", content: [{ text: "Say hello." }] }],
      inferenceConfig: { maxTokens: 64 },
    });
    expect(response).toMatchObject({ text: "Hello.", inputTokens: 12, outputTokens: 3 });
  });

  it.each(UNNAMED_FAMILY_IDS)(
    "sends the caller's temperature to %s when samplingParameters is send",
    async (model) => {
      const { sent, provider } = fakeBedrockRuntime({ samplingParameters: "send" });
      const opts: ChatOptions = { model, maxTokens: 64, temperature: 0.2 };

      await provider.chat(SAY_HELLO, opts);

      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64, temperature: 0.2 });
      expect(provider.sampling?.(opts)).toEqual({ temperature: 0.2 });
    },
  );

  it.each(OTHER_FAMILY_IDS)(
    "sends no sampling parameters to %s when samplingParameters is omit",
    async (model) => {
      const { sent, provider } = fakeBedrockRuntime({ samplingParameters: "omit" });
      const opts: ChatOptions = { model, maxTokens: 64, temperature: 0.2 };

      await provider.chat(SAY_HELLO, opts);

      expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64 });
      expect(provider.sampling?.(opts)).toEqual({});
    },
  );

  it("sends no temperature the caller did not set, whatever samplingParameters is", async () => {
    const { sent, provider } = fakeBedrockRuntime({ samplingParameters: "send" });

    await provider.chat(SAY_HELLO, { model: "amazon.nova-pro-v1:0", maxTokens: 64 });

    expect(sent[0].body.inferenceConfig).toEqual({ maxTokens: 64 });
  });
});

describe("BEDROCK_SAMPLING_PARAMETERS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["send", { temperature: 0.2 }],
    ["auto", {}],
  ])(
    "sets what the registered provider sends to an ARN that names no family: %s",
    async (value, sent) => {
      vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", value);
      // The registered provider reads the variable once, when its module loads.
      vi.resetModules();
      await import("../providers/bedrock.js");
      const { getProvider } = await import("../providers/registry.js");

      const opts = { model: UNNAMED_FAMILY_IDS[0], temperature: 0.2 };
      expect(getProvider("bedrock").sampling?.(opts)).toEqual(sent);
    },
  );

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

  it("fails the import of the registered provider on a value it does not know", async () => {
    vi.stubEnv("BEDROCK_SAMPLING_PARAMETERS", "always");
    vi.resetModules();

    await expect(import("../providers/bedrock.js")).rejects.toThrow(
      'BEDROCK_SAMPLING_PARAMETERS must be one of auto, send, omit, got "always"',
    );
  });
});

describe("gateway cache over the bedrock provider", () => {
  /** A gateway over `provider`, registered under a name no other test uses. */
  function gatewayOver(
    name: string,
    provider: ReturnType<typeof createBedrockProvider>,
    model?: string,
  ) {
    registerProvider(name, () => provider);
    return createGateway({
      providers: [name],
      cachingStrategy: "hash",
      models: model ? { bedrock: model } : undefined,
    });
  }

  it("serves a request that differs only in temperature from cache for a Claude model", async () => {
    const { sent, provider } = fakeBedrockRuntime();
    const gateway = gatewayOver("bedrock-claude", provider);
    const messages = [{ role: "user" as const, content: "Cache me on Claude." }];

    const first = await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });

    expect(sent).toHaveLength(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    await gateway.close();
  });

  it("keys on temperature for a model that receives it", async () => {
    const { sent, provider } = fakeBedrockRuntime();
    const gateway = gatewayOver("bedrock-nova", provider, "amazon.nova-pro-v1:0");
    const messages = [{ role: "user" as const, content: "Cache me on Nova." }];

    await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });
    const third = await gateway.chat(messages, { temperature: 0.2 });

    expect(sent).toHaveLength(2);
    expect(sent[1].body.inferenceConfig).toEqual({ maxTokens: 4096, temperature: 0.7 });
    expect(second.cached).toBe(false);
    expect(third.cached).toBe(true);
    await gateway.close();
  });
});

/**
 * A Bedrock provider over a request handler that answers nothing, as a
 * hung connection does, until its request aborts. It keeps whether each
 * request's signal fired.
 */
function hungBedrockRuntime(
  options: Omit<BedrockProviderOptions, "client"> = {},
  create = createBedrockProvider,
) {
  const aborted: boolean[] = [];
  const provider = create({
    ...options,
    client: {
      region: "us-east-1",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "test-secret" },
      maxAttempts: 1,
      requestHandler: {
        handle(_request: unknown, handlerOptions?: { abortSignal?: AbortSignal }) {
          const index = aborted.push(false) - 1;
          const signal = handlerOptions?.abortSignal;
          return new Promise<never>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              aborted[index] = true;
              reject(signal.reason);
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
 * Waits, on the real event loop, until a request reaches the handler: the
 * SDK can read its configuration from disk before it sends, which fake
 * timers do not wait for. The fake clock stands still meanwhile.
 */
async function untilSent(aborted: boolean[]): Promise<void> {
  while (aborted.length === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("bedrock provider request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ["at 120 seconds by default", {}, 120_000],
    ["at requestTimeoutMs", { requestTimeoutMs: 5_000 }, 5_000],
  ])("gives up on a call %s and aborts its request", async (_when, options, ms) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, provider } = hungBedrockRuntime(options);

    const chat = track(provider.chat(SAY_HELLO));
    await untilSent(aborted);

    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(chat.outcome).toBe("waiting");
    expect(aborted).toEqual([false]);

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(aborted).toEqual([true]);
  });

  it("takes LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import("../providers/bedrock.js");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { aborted, provider } = hungBedrockRuntime({}, fresh.createBedrockProvider);

    const chat = track(provider.chat(SAY_HELLO));
    await untilSent(aborted);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(chat.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(chat.outcome).toMatchObject({ name: "RequestTimeoutError", timeoutMs: 5_000 });
  });
});
