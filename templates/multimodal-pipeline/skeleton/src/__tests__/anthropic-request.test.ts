/**
 * Tests for the request body the Anthropic provider builds.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any
 * value, the default included, so a body carrying one fails before a
 * model sees it. The pipeline passes a temperature to every provider;
 * these verify the Anthropic provider keeps it out of the body, and that
 * an instance says once, at debug level, that it dropped it. The SDK
 * client is replaced with a recorder, and the assertions read the body
 * the provider handed it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
import type { ProcessedInput } from "../processors/types.js";
import "../providers/anthropic.js";
import { getProvider } from "../providers/registry.js";

const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const image: ProcessedInput = {
  modality: "image",
  mimeType: "image/png",
  source: "diagram.png",
  base64: "aW1hZ2U=",
  metadata: {},
};

function sentBody(): Record<string, unknown> {
  expect(create).toHaveBeenCalledOnce();
  return create.mock.calls[0][0];
}

function expectNoSampling(body: Record<string, unknown>): void {
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("top_p");
  expect(body).not.toHaveProperty("top_k");
}

describe("anthropic provider request", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      content: [{ type: "text", text: "A labelled architecture diagram." }],
      model: "claude-sonnet-5",
      usage: { input_tokens: 40, output_tokens: 8 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends an image with no sampling parameters", async () => {
    const provider = getProvider("anthropic", "test-key");

    await provider.analyze(image, "Describe the input.", "claude-sonnet-5", 0.1, 512);

    const body = sentBody();
    expectNoSampling(body);
    expect(body).toMatchObject({
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
            { type: "text" },
          ],
        },
      ],
    });
  });

  it("sends video frames with no sampling parameters", async () => {
    const provider = getProvider("anthropic", "test-key");

    await provider.analyzeFrames(
      ["ZnJhbWUx", "ZnJhbWUy"],
      "Describe the input.",
      "claude-sonnet-5",
      0.1,
      512,
    );

    const body = sentBody();
    expectNoSampling(body);
    const [message] = body.messages as { content: { type: string }[] }[];
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
    const dropped = () =>
      debug.mock.calls.filter(([message]) => message === "anthropic sends no temperature");
    const provider = getProvider("anthropic", "test-key");

    await provider.analyze(image, "Describe the input.", "claude-sonnet-5", 0.1, 512);
    await provider.analyzeFrames(["ZnJhbWUx"], "Describe the input.", "claude-sonnet-5", 0.1, 512);
    expect(dropped()).toEqual([["anthropic sends no temperature", { temperature: 0.1 }]]);

    await getProvider("anthropic", "test-key").analyzeFrames(
      ["ZnJhbWUx"],
      "Describe the input.",
      "claude-sonnet-5",
      0.1,
      512,
    );
    expect(dropped()).toHaveLength(2);
  });
});
