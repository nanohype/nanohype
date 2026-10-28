import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGateway } from "../index.js";
import { getProvider } from "../providers/registry.js";

// ── Anthropic Request Tests ─────────────────────────────────────────
//
// The Messages API rejects `temperature`, `top_p` and `top_k` at any
// value, the default included, so a body carrying one fails before a
// model sees it. ChatOptions keeps `temperature` for the providers whose
// APIs accept it; these verify the Anthropic provider keeps it out of the
// body, and that the gateway's response cache does not split on a
// temperature the provider drops. The SDK client is replaced with a
// recorder, and the assertions read the body the provider handed it.
//

const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

describe("anthropic provider request", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      content: [{ type: "text", text: "Hello." }],
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  });

  it("sends no sampling parameters when the caller sets a temperature", async () => {
    await getProvider("anthropic").chat(
      [
        { role: "system", content: "Answer briefly." },
        { role: "user", content: "Say hello." },
      ],
      { model: "claude-sonnet-5", maxTokens: 64, temperature: 0.2 },
    );

    expect(create).toHaveBeenCalledOnce();
    const [body] = create.mock.calls[0];
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
    expect(body).toMatchObject({
      model: "claude-sonnet-5",
      max_tokens: 64,
      system: "Answer briefly.",
      messages: [{ role: "user", content: "Say hello." }],
    });
  });

  it("lets a gateway serve a request that differs only in temperature from cache", async () => {
    const gateway = createGateway({ providers: ["anthropic"], cachingStrategy: "hash" });
    const messages = [{ role: "user" as const, content: "Cache me." }];

    const first = await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });

    expect(create).toHaveBeenCalledOnce();
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    await gateway.close();
  });
});
