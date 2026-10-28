import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLlmProvider } from "../llm/index.js";

/**
 * The request body the Anthropic provider builds.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any value, the
 * default included, so a body carrying one fails before a model sees it. The
 * SDK client is replaced with a recorder, and the assertions read the body the
 * provider handed it.
 */

const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

describe("anthropic llm provider request", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    create.mockReset();
    create.mockResolvedValue({ content: [{ type: "text", text: "an answer" }] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("carries no sampling parameters", async () => {
    await getLlmProvider("anthropic").complete(
      [
        { role: "system", content: "You maintain a wiki." },
        { role: "user", content: "What does the wiki say about rollbacks?" },
      ],
      { model: "claude-sonnet-5", maxTokens: 256 },
    );

    expect(create).toHaveBeenCalledOnce();
    const [body] = create.mock.calls[0];
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
    expect(body).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 256,
      system: "You maintain a wiki.",
      messages: [{ role: "user", content: "What does the wiki say about rollbacks?" }],
    });
  });
});
