import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGateway } from "../index.js";
import { getProvider } from "../providers/registry.js";

// ── Bedrock Request Tests ───────────────────────────────────────────
//
// Bedrock documents `temperature`, `top_p` and `top_k` per Claude model,
// and no single rule over provider-neutral options meets all of them, so
// the provider sends none to a Claude model id and the caller's
// temperature to any other model family. These verify both halves
// against the Converse request the provider builds, and that the
// gateway's response cache follows what the provider sends. The SDK
// client is replaced with a recorder; the command classes are the SDK's
// own, so the assertions read the input a real ConverseCommand carries.
//

const send = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-bedrock-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-bedrock-runtime")>()),
  BedrockRuntimeClient: class {
    send = send;
  },
}));

const CLAUDE_MODEL_IDS = [
  "us.anthropic.claude-sonnet-5",
  "global.anthropic.claude-opus-5",
  "anthropic.claude-sonnet-5",
  "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-5",
];

const OTHER_MODEL_ID = "amazon.nova-pro-v1:0";

/** The input of the ConverseCommand handed to the client on call `n`. */
function sentInput(n = 0): Record<string, unknown> {
  return send.mock.calls[n][0].input;
}

describe("bedrock provider request", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({
      output: { message: { role: "assistant", content: [{ text: "Hello." }] } },
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it.each(CLAUDE_MODEL_IDS)("sends no sampling parameters to %s", async (model) => {
    await getProvider("bedrock").chat([{ role: "user", content: "Say hello." }], {
      model,
      maxTokens: 64,
      temperature: 0.2,
    });

    expect(send).toHaveBeenCalledOnce();
    expect(sentInput()).toMatchObject({ modelId: model, inferenceConfig: { maxTokens: 64 } });
    expect(sentInput().inferenceConfig).toEqual({ maxTokens: 64 });
  });

  it("sends no sampling parameters to the default model", async () => {
    await getProvider("bedrock").chat([{ role: "user", content: "Say hello." }], {
      maxTokens: 64,
      temperature: 0.2,
    });

    expect(sentInput().modelId).toMatch(/anthropic\./);
    expect(sentInput().inferenceConfig).toEqual({ maxTokens: 64 });
  });

  it("sends the caller's temperature to a model outside the Claude family", async () => {
    await getProvider("bedrock").chat(
      [
        { role: "system", content: "Answer briefly." },
        { role: "user", content: "Say hello." },
      ],
      { model: OTHER_MODEL_ID, maxTokens: 64, temperature: 0.2 },
    );

    expect(sentInput()).toMatchObject({
      modelId: OTHER_MODEL_ID,
      system: [{ text: "Answer briefly." }, { cachePoint: { type: "default" } }],
      messages: [{ role: "user", content: [{ text: "Say hello." }] }],
    });
    expect(sentInput().inferenceConfig).toEqual({ maxTokens: 64, temperature: 0.2 });
  });

  it("leaves temperature out when the caller sets none", async () => {
    await getProvider("bedrock").chat([{ role: "user", content: "Say hello." }], {
      model: OTHER_MODEL_ID,
      maxTokens: 64,
    });

    expect(sentInput().inferenceConfig).toEqual({ maxTokens: 64 });
  });
});

describe("gateway cache over the bedrock provider", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({
      output: { message: { role: "assistant", content: [{ text: "Hello." }] } },
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("serves a request that differs only in temperature from cache for a Claude model", async () => {
    const gateway = createGateway({ providers: ["bedrock"], cachingStrategy: "hash" });
    const messages = [{ role: "user" as const, content: "Cache me on Claude." }];

    const first = await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });

    expect(send).toHaveBeenCalledOnce();
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    await gateway.close();
  });

  it("keys on temperature for a model that receives it", async () => {
    const gateway = createGateway({
      providers: ["bedrock"],
      cachingStrategy: "hash",
      models: { bedrock: OTHER_MODEL_ID },
    });
    const messages = [{ role: "user" as const, content: "Cache me on Nova." }];

    await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });
    const third = await gateway.chat(messages, { temperature: 0.2 });

    expect(send).toHaveBeenCalledTimes(2);
    expect(sentInput(1).inferenceConfig).toEqual({ maxTokens: 4096, temperature: 0.7 });
    expect(second.cached).toBe(false);
    expect(third.cached).toBe(true);
    await gateway.close();
  });
});
