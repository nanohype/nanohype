import type { ClientOptions } from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGateway } from "../index.js";
import { createAnthropicProvider } from "../providers/anthropic.js";
import { registerProvider } from "../providers/registry.js";
import type { ChatOptions } from "../types.js";

// ── Anthropic Request Tests ─────────────────────────────────────────
//
// The Messages API rejects `temperature`, `top_p` and `top_k` at any
// value, the default included, so a body carrying one fails before a
// model sees it. ChatOptions keeps `temperature` for the providers whose
// APIs accept it; these verify the Anthropic provider keeps it out of the
// body, that its `sampling` hook declares what the body carries, and that
// a gateway's response cache does not split on a temperature the
// provider drops. They also hold the client to its request timeout. The
// provider runs the real SDK client over a `fetch` that answers
// in-process, so the assertions read the request the SDK put on the
// wire, and no request leaves the process.
//

interface SentRequest {
  url: string;
  method: string;
  /** The timeout the SDK armed, in whole seconds (X-Stainless-Timeout). */
  timeout: string | null;
  body: Record<string, unknown>;
}

/**
 * A Messages API that answers every request with one text message, and a
 * provider over it whose client options are `client` over the fake's.
 */
function fakeMessagesApi(client: ClientOptions = {}, create = createAnthropicProvider) {
  const sent: SentRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? "GET",
      timeout: new Headers(init?.headers).get("x-stainless-timeout"),
      body: JSON.parse(String(init?.body)),
    });
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "Hello." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  };
  const provider = create({
    client: {
      apiKey: "test-key",
      maxRetries: 0,
      fetch: fetch as typeof globalThis.fetch,
      ...client,
    },
  });
  return { sent, provider };
}

/** The sampling fields a Messages API body carries. */
function samplingIn(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => ["temperature", "top_p", "top_k"].includes(key)),
  );
}

describe("anthropic provider request", () => {
  it("sends no sampling parameters when the caller sets a temperature", async () => {
    const { sent, provider } = fakeMessagesApi();
    const opts: ChatOptions = { model: "claude-sonnet-5", maxTokens: 64, temperature: 0.2 };

    const response = await provider.chat(
      [
        { role: "system", content: "Answer briefly." },
        { role: "user", content: "Say hello." },
      ],
      opts,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe("POST");
    expect(new URL(sent[0].url).pathname).toBe("/v1/messages");
    expect(sent[0].body).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 64,
      system: "Answer briefly.",
      messages: [{ role: "user", content: "Say hello." }],
    });
    expect(response).toMatchObject({ text: "Hello.", inputTokens: 12, outputTokens: 3 });
  });

  it.each<ChatOptions>([{ temperature: 0.2 }, { temperature: 0 }, {}])(
    "declares the sampling options its request carries for %o",
    async (opts) => {
      const { sent, provider } = fakeMessagesApi();

      await provider.chat([{ role: "user", content: "Say hello." }], opts);

      expect(provider.sampling?.(opts)).toEqual({});
      expect(samplingIn(sent[0].body)).toEqual(provider.sampling?.(opts));
    },
  );

  it("lets a gateway serve a request that differs only in temperature from cache", async () => {
    const { sent, provider } = fakeMessagesApi();
    registerProvider("anthropic-in-process", () => provider);
    const gateway = createGateway({
      providers: ["anthropic-in-process"],
      cachingStrategy: "hash",
    });
    const messages = [{ role: "user" as const, content: "Cache me." }];

    const first = await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });

    expect(sent).toHaveLength(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    await gateway.close();
  });
});

describe("anthropic provider request timeout", () => {
  const messages = [{ role: "user" as const, content: "Say hello." }];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bounds a request at 30 seconds by default, as the bedrock provider does", async () => {
    const { sent, provider } = fakeMessagesApi();

    await provider.chat(messages);

    expect(sent[0].timeout).toBe("30");
  });

  it("takes LLM_REQUEST_TIMEOUT_MS as its module loads", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");
    vi.resetModules();
    const fresh = await import("../providers/anthropic.js");
    const { sent, provider } = fakeMessagesApi({}, fresh.createAnthropicProvider);

    await provider.chat(messages);

    expect(sent[0].timeout).toBe("5");
  });

  it("keeps a timeout the caller's client options set", async () => {
    const { sent, provider } = fakeMessagesApi({ timeout: 90_000 });

    await provider.chat(messages);

    expect(sent[0].timeout).toBe("90");
  });
});
