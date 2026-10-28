import { beforeEach, describe, expect, it, vi } from "vitest";
import "../providers/anthropic.js";
import { getProvider } from "../providers/registry.js";
import type { ChatMessage, ChatOptions } from "../types.js";

// ── Anthropic Request Tests ────────────────────────────────────────
//
// The Messages API rejects `temperature`, `top_p` and `top_k` at any
// value, the default included, so a body carrying one fails before a
// model sees it. ChatOptions keeps `temperature` and `topP` for the
// providers whose APIs accept them; these verify the Anthropic provider
// keeps both out of the body in each request mode. The SDK client is
// replaced with a recorder, and the assertions read the body the
// provider handed it.
//

const { create, stream } = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create, stream };
  },
}));

const messages: ChatMessage[] = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Say hello." },
];

const opts: ChatOptions = {
  model: "claude-sonnet-5",
  maxTokens: 64,
  temperature: 0.2,
  topP: 0.9,
  stop: ["\n\n"],
};

function expectNoSampling(body: Record<string, unknown>): void {
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("top_p");
  expect(body).not.toHaveProperty("top_k");
  expect(body).toMatchObject({
    model: "claude-sonnet-5",
    max_tokens: 64,
    system: "Answer briefly.",
    messages: [{ role: "user", content: "Say hello." }],
    stop_sequences: ["\n\n"],
  });
}

describe("anthropic provider request", () => {
  beforeEach(() => {
    create.mockReset();
    stream.mockReset();
  });

  it("chat sends no sampling parameters when the caller sets them", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "Hello." }],
      usage: { input_tokens: 12, output_tokens: 3 },
    });

    await getProvider("anthropic").chat(messages, opts);

    expect(create).toHaveBeenCalledOnce();
    expectNoSampling(create.mock.calls[0][0]);
  });

  it("streamChat sends no sampling parameters when the caller sets them", async () => {
    stream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hello." } };
      },
      finalMessage: async () => ({ usage: { input_tokens: 12, output_tokens: 3 } }),
    });

    const response = getProvider("anthropic").streamChat(messages, opts);
    const text: string[] = [];
    for await (const chunk of response) {
      text.push(chunk.text);
    }

    expect(stream).toHaveBeenCalledOnce();
    expectNoSampling(stream.mock.calls[0][0]);
    expect(text.join("")).toBe("Hello.");
    await expect(response.response).resolves.toMatchObject({ text: "Hello." });
  });
});
