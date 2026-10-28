/**
 * Tests for the temperature the OpenAI provider sends.
 *
 * LLM_TEMPERATURE is optional, so the configuration can say it set none, and
 * the OpenAI provider then sends 0.1. These hold the configuration and the
 * provider to that together: the temperature `loadConfig` reads is the one
 * handed to the provider, and the assertions read the body the SDK put on the
 * wire. The provider runs the real SDK client over a `fetch` that answers
 * in-process, so no request leaves the process.
 */

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
