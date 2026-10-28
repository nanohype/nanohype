/**
 * Tests for the temperature the OpenAI provider sends.
 *
 * LLM_TEMPERATURE is optional, so the configuration can say it set none, and
 * the OpenAI provider then sends 0.1. These hold the configuration and the
 * provider to that together: the temperature `loadConfig` reads is the one
 * handed to the provider, and the assertions read the body the SDK put on the
 * wire. They also hold the client to its request timeout. The provider runs
 * the real SDK client over a `fetch` that answers in-process, so no request
 * leaves the process.
 */

import { APIConnectionTimeoutError, type ClientOptions } from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import type { ProcessedInput } from "../processors/types.js";
import { OpenAIVisionProvider } from "../providers/openai.js";
import { getProvider } from "../providers/registry.js";

const image: ProcessedInput = {
  modality: "image",
  mimeType: "image/png",
  source: "diagram.png",
  base64: "aW1hZ2U=",
  metadata: {},
};

/** A Chat Completions API that answers every request with one message. */
function fakeChatCompletions() {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "A labelled architecture diagram." },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48 },
    });
  };
  const provider = new OpenAIVisionProvider("test-key", {
    maxRetries: 0,
    fetch: fetch as typeof globalThis.fetch,
  });
  return { sent, provider };
}

/** The temperature the configuration holds with LLM_TEMPERATURE at `value`. */
function configuredTemperature(value: string | undefined): number | undefined {
  vi.stubEnv("LLM_TEMPERATURE", value);
  return loadConfig().llm.temperature;
}

describe("openai provider request", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends 0.1 with an image when the configuration sets no temperature", async () => {
    const temperature = configuredTemperature(undefined);
    const { sent, provider } = fakeChatCompletions();

    const result = await provider.analyze(image, "Describe the input.", "gpt-4o", temperature, 512);

    expect(temperature).toBeUndefined();
    expect(sent).toEqual([
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Describe the input." },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,aW1hZ2U=", detail: "high" },
              },
              {
                type: "text",
                text: "Analyze this image and provide a detailed structured description.",
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 512,
      },
    ]);
    expect(result).toEqual({
      content: "A labelled architecture diagram.",
      model: "gpt-4o",
      usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48 },
    });
  });

  it("sends 0.1 with video frames when the configuration sets no temperature", async () => {
    const { sent, provider } = fakeChatCompletions();

    await provider.analyzeFrames(
      ["ZnJhbWUx"],
      "Describe the input.",
      "gpt-4o",
      configuredTemperature(undefined),
      512,
    );

    expect(sent[0].temperature).toBe(0.1);
  });

  it("reads an empty LLM_TEMPERATURE as unset, and sends 0.1", async () => {
    const temperature = configuredTemperature("");
    const { sent, provider } = fakeChatCompletions();

    await provider.analyze(image, "Describe the input.", "gpt-4o", temperature, 512);

    expect(temperature).toBeUndefined();
    expect(sent[0].temperature).toBe(0.1);
  });

  it.each([
    ["0", 0],
    ["0.7", 0.7],
  ])("sends LLM_TEMPERATURE=%s as %s", async (value, expected) => {
    const { sent, provider } = fakeChatCompletions();

    await provider.analyze(
      image,
      "Describe the input.",
      "gpt-4o",
      configuredTemperature(value),
      512,
    );
    await provider.analyzeFrames(
      ["ZnJhbWUx"],
      "Describe the input.",
      "gpt-4o",
      configuredTemperature(value),
      512,
    );

    expect(sent.map((body) => body.temperature)).toEqual([expected, expected]);
  });

  it("is the provider the registry builds for openai", () => {
    expect(getProvider("openai", "test-key")).toBeInstanceOf(OpenAIVisionProvider);
  });
});

/** A `fetch` that answers nothing, as a hung connection does, until its request aborts. */
const hungFetch = ((_input: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof globalThis.fetch;

/**
 * Starts an analysis on a provider over hungFetch, and reports whether it is
 * still waiting after `elapsedMs` of fake time.
 */
async function waitingAfter(
  elapsedMs: number,
  client: ClientOptions = {},
  Provider = OpenAIVisionProvider,
) {
  const provider = new Provider("test-key", { maxRetries: 0, fetch: hungFetch, ...client });
  let outcome: unknown = "waiting";
  provider.analyze(image, "Describe the input.", "gpt-4o", undefined, 512).then(
    () => {
      outcome = "answered";
    },
    (error: unknown) => {
      outcome = error;
    },
  );
  await vi.advanceTimersByTimeAsync(elapsedMs);
  return {
    get outcome() {
      return outcome;
    },
    advance: (ms: number) => vi.advanceTimersByTimeAsync(ms),
  };
}

describe("openai provider request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("abandons a hung request at 30 seconds by default", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const request = await waitingAfter(29_999);
    expect(request.outcome).toBe("waiting");

    await request.advance(1);
    expect(request.outcome).toBeInstanceOf(APIConnectionTimeoutError);
  });

  it("takes LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import("../providers/openai.js");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const request = await waitingAfter(4_999, {}, fresh.OpenAIVisionProvider);
    expect(request.outcome).toBe("waiting");

    await request.advance(1);
    expect(request.outcome).toBeInstanceOf(APIConnectionTimeoutError);
  });

  it("keeps a timeout the caller's client options set", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const request = await waitingAfter(89_999, { timeout: 90_000 });
    expect(request.outcome).toBe("waiting");

    await request.advance(1);
    expect(request.outcome).toBeInstanceOf(APIConnectionTimeoutError);
  });
});
