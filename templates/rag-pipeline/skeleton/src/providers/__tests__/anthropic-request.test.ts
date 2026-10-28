/**
 * Tests for the request body the Anthropic provider builds.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any
 * value, the default included, so a body carrying one fails before a
 * model sees it. Generation passes the configured temperature to every
 * provider; these verify the Anthropic provider keeps it out of the body,
 * and that an instance says once, at debug level, that it dropped one the
 * configuration set. They also hold the client to the timeout
 * LLM_REQUEST_TIMEOUT_MS sets on each attempt, and to the bound that and
 * REQUEST_MAX_RETRIES put on a call to an endpoint that never answers. The
 * provider runs the real SDK client over an in-process `fetch`: one that
 * answers, so the assertions read the request the SDK put on the wire, or one
 * that never answers, timed with fake timers. No request leaves the process.
 */

import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { generate } from "../../generation.js";
import { logger } from "../../logger.js";
import { AnthropicLlm, type AnthropicLlmOptions } from "../anthropic.js";
import { getLlmProvider } from "../registry.js";

/**
 * A Messages API that answers every request with one text message. It keeps
 * each body, and the timeout the SDK armed for it, which the SDK reports in
 * whole seconds as the X-Stainless-Timeout header.
 */
function messagesApiFetch() {
  const sent: Record<string, unknown>[] = [];
  const timeouts: (string | null)[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    timeouts.push(new Headers(init?.headers).get("x-stainless-timeout"));
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "Rollbacks restore the previous release." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 8 },
    });
  };
  return { sent, timeouts, fetch: fetch as typeof globalThis.fetch };
}

/** An Anthropic LLM over messagesApiFetch, built with `options`. */
function fakeMessagesApi(options: AnthropicLlmOptions = {}) {
  const { sent, timeouts, fetch } = messagesApiFetch();
  const provider = new AnthropicLlm({ apiKey: "test-key", ...options, client: { fetch } });
  return { sent, timeouts, provider };
}

const DROPPED = "anthropic sends no temperature";

describe("anthropic provider request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends no sampling parameters when the configuration sets a temperature", async () => {
    const { sent, provider } = fakeMessagesApi();

    const result = await provider.generate(
      "Answer from the context.",
      "How do rollbacks work?",
      "claude-sonnet-5",
      0.1,
      512,
    );

    expect(sent).toEqual([
      {
        model: "claude-sonnet-5",
        max_tokens: 512,
        system: "Answer from the context.",
        messages: [{ role: "user", content: "How do rollbacks work?" }],
      },
    ]);
    expect(result).toEqual({
      answer: "Rollbacks restore the previous release.",
      usage: { input_tokens: 40, output_tokens: 8, total_tokens: 48 },
    });
  });

  it("says once per instance, at debug level, that it dropped the temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const dropped = () => debug.mock.calls.filter(([message]) => message === DROPPED);
    const { provider } = fakeMessagesApi();

    await provider.generate("Answer.", "First question?", "claude-sonnet-5", 0.1, 512);
    await provider.generate("Answer.", "Second question?", "claude-sonnet-5", 0.1, 512);
    expect(dropped()).toEqual([[DROPPED, { temperature: 0.1 }]]);

    await fakeMessagesApi().provider.generate("Answer.", "Third?", "claude-sonnet-5", 0, 512);
    expect(dropped()).toHaveLength(2);
  });

  it("says nothing when the configuration sets no temperature", async () => {
    const debug = vi.spyOn(logger, "debug");
    const { provider } = fakeMessagesApi();

    await provider.generate("Answer.", "First question?", "claude-sonnet-5", undefined, 512);

    expect(debug.mock.calls.filter(([message]) => message === DROPPED)).toEqual([]);
  });

  it("is the provider the registry builds for anthropic", () => {
    expect(getLlmProvider("anthropic", { anthropicApiKey: "test-key" })).toBeInstanceOf(
      AnthropicLlm,
    );
  });

  it("says once across the queries one configuration makes that it dropped the temperature", async () => {
    vi.stubGlobal("fetch", messagesApiFetch().fetch);
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("LLM_TEMPERATURE", "0.1");
    const debug = vi.spyOn(logger, "debug");
    const dropped = () => debug.mock.calls.filter(([message]) => message === DROPPED);
    const config = loadConfig();

    await generate("How do rollbacks work?", [], config);
    await generate("How do roll-forwards work?", [], config);

    expect(dropped()).toEqual([[DROPPED, { temperature: 0.1 }]]);
  });
});

describe("anthropic provider request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("arms a 120-second timeout on each attempt by default", async () => {
    const { timeouts, provider } = fakeMessagesApi();

    await provider.generate("Answer.", "How do rollbacks work?", "claude-sonnet-5", undefined, 512);

    expect(timeouts).toEqual(["120"]);
  });

  it("arms the configured LLM_REQUEST_TIMEOUT_MS on the provider generation builds", async () => {
    const { timeouts, fetch } = messagesApiFetch();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "5000");

    await generate("How do rollbacks work?", [], loadConfig());

    expect(timeouts).toEqual(["5"]);
  });

  it("gives up on an endpoint that never answers after two attempts of 120 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // No jitter, so the SDK waits its full 500 ms before the retry.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const retryCounts: (string | null)[] = [];
    const fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      retryCounts.push(new Headers(init?.headers).get("x-stainless-retry-count"));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }) as typeof globalThis.fetch;
    const provider = new AnthropicLlm({ apiKey: "test-key", client: { fetch } });

    let outcome: unknown = "waiting";
    provider.generate("Answer.", "How do rollbacks work?", "claude-sonnet-5", undefined, 512).then(
      () => {
        outcome = "answered";
      },
      (error: unknown) => {
        outcome = error;
      },
    );

    await vi.advanceTimersByTimeAsync(120_000 + 500 + 120_000 - 1);
    expect(outcome).toBe("waiting");
    expect(retryCounts).toEqual(["0", "1"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBeInstanceOf(APIConnectionTimeoutError);
    expect(retryCounts).toEqual(["0", "1"]);
  });
});
