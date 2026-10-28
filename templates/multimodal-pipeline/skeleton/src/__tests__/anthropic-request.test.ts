/**
 * Tests for the request body the Anthropic provider builds.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any
 * value, the default included, so a body carrying one fails before a
 * model sees it. The pipeline passes the configured temperature to every
 * provider; these verify the Anthropic provider keeps it out of the body,
 * and that an instance says once, at debug level, that it dropped one the
 * configuration set. The provider runs the real SDK client over a `fetch`
 * that answers in-process, so the assertions read the body the SDK put on
 * the wire, and no request leaves the process.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
import type { ProcessedInput } from "../processors/types.js";
import { AnthropicVisionProvider } from "../providers/anthropic.js";
import { getProvider } from "../providers/registry.js";

const image: ProcessedInput = {
  modality: "image",
  mimeType: "image/png",
  source: "diagram.png",
  base64: "aW1hZ2U=",
  metadata: {},
};

/** A Messages API that answers every request with one text message. */
function fakeMessagesApi() {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "A labelled architecture diagram." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 8 },
    });
  };
  const provider = new AnthropicVisionProvider("test-key", {
    maxRetries: 0,
    fetch: fetch as typeof globalThis.fetch,
  });
  return { sent, provider };
}

const SAMPLING_FIELDS = ["temperature", "top_p", "top_k"];

const DROPPED = "anthropic sends no temperature";

describe("anthropic provider request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends an image with no sampling parameters", async () => {
    const { sent, provider } = fakeMessagesApi();

    const result = await provider.analyze(
      image,
      "Describe the input.",
      "claude-sonnet-5",
      0.1,
      512,
    );

    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0]).filter((key) => SAMPLING_FIELDS.includes(key))).toEqual([]);
    expect(sent[0]).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: "Describe the input.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" },
            },
            {
              type: "text",
              text: "Analyze this image and provide a detailed structured description.",
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      content: "A labelled architecture diagram.",
      model: "claude-sonnet-5",
      usage: { input_tokens: 40, output_tokens: 8, total_tokens: 48 },
    });
  });

  it("sends video frames with no sampling parameters", async () => {
    const { sent, provider } = fakeMessagesApi();

    await provider.analyzeFrames(
      ["ZnJhbWUx", "ZnJhbWUy"],
      "Describe the input.",
      "claude-sonnet-5",
      0.1,
      512,
    );

    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0]).sort()).toEqual(["max_tokens", "messages", "model", "system"]);
    const [message] = sent[0].messages as { content: { type: string }[] }[];
    expect(message.content.map((block) => block.type)).toEqual([
      "image",
      "text",
      "image",
      "text",
      "text",
    ]);
  });

  it("says once per instance, at debug level, that it dropped the temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () => debug.mock.calls.filter(([message]) => message === DROPPED);
    const { provider } = fakeMessagesApi();

    await provider.analyze(image, "Describe the input.", "claude-sonnet-5", 0.1, 512);
    await provider.analyzeFrames(["ZnJhbWUx"], "Describe the input.", "claude-sonnet-5", 0.1, 512);
    expect(dropped()).toEqual([[DROPPED, { temperature: 0.1 }]]);

    await fakeMessagesApi().provider.analyzeFrames(
      ["ZnJhbWUx"],
      "Describe the input.",
      "claude-sonnet-5",
      0,
      512,
    );
    expect(dropped()).toHaveLength(2);
  });

  it("says nothing when the configuration sets no temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const { provider } = fakeMessagesApi();

    await provider.analyze(image, "Describe the input.", "claude-sonnet-5", undefined, 512);
    await provider.analyzeFrames(
      ["ZnJhbWUx"],
      "Describe the input.",
      "claude-sonnet-5",
      undefined,
      512,
    );

    expect(debug.mock.calls.filter(([message]) => message === DROPPED)).toEqual([]);
  });

  it("is the provider the registry builds for anthropic", () => {
    expect(getProvider("anthropic", "test-key")).toBeInstanceOf(AnthropicVisionProvider);
  });
});
