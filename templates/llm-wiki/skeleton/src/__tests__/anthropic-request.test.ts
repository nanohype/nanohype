import { APIConnectionTimeoutError, type ClientOptions } from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { resetConfig } from "../config.js";
import { AnthropicLlmProvider } from "../llm/anthropic.js";
import { getLlmProvider } from "../llm/index.js";
import type { LlmOptions } from "../llm/types.js";

/**
 * The request the Anthropic provider builds and the response it accepts.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any value, the
 * default included, so a body carrying one fails before a model sees it. These
 * verify the body carries none of them, even when the options handed to the
 * provider hold some. They also hold the client to the request timeout the
 * configuration sets and to the bound that and the provider's retry count put
 * on a call to an endpoint that never answers. The provider runs the real SDK
 * client over an in-process `fetch`: one that answers, so the assertions read
 * the request the SDK put on the wire, or one that never answers, timed with
 * fake timers. No request leaves the process.
 */

/**
 * A Messages API that answers every request with a message of `content`. It
 * keeps each body, and the timeout the SDK armed for it, which the SDK
 * reports in whole seconds as the X-Stainless-Timeout header.
 */
function fakeMessagesApi(
  content: unknown[] = [{ type: "text", text: "an answer" }],
  client: ClientOptions = {},
) {
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
      content,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 8 },
    });
  };
  const provider = new AnthropicLlmProvider({
    maxRetries: 0,
    fetch: fetch as typeof globalThis.fetch,
    ...client,
  });
  return { sent, timeouts, provider };
}

const ASK = [
  { role: "system" as const, content: "You maintain a wiki." },
  { role: "user" as const, content: "What does the wiki say about rollbacks?" },
];

describe("anthropic llm provider request", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("carries no sampling parameters, even from options that hold them", async () => {
    const { sent, provider } = fakeMessagesApi();
    // Options a caller built for another provider: LlmOptions declares none
    // of these, so only a value typed elsewhere can carry them here.
    const options = {
      model: "claude-sonnet-5",
      maxTokens: 256,
      temperature: 0.2,
      topP: 0.9,
      top_p: 0.9,
      top_k: 5,
    } as LlmOptions;

    const answer = await provider.complete(ASK, options);

    expect(answer).toBe("an answer");
    expect(sent).toEqual([
      {
        model: "claude-sonnet-5",
        max_tokens: 256,
        system: "You maintain a wiki.",
        messages: [{ role: "user", content: "What does the wiki say about rollbacks?" }],
      },
    ]);
  });

  it("sends the default model and token limit, and no system prompt it was not given", async () => {
    const { sent, provider } = fakeMessagesApi();

    await provider.complete([ASK[1]]);

    expect(sent).toEqual([
      {
        model: "claude-sonnet-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: "What does the wiki say about rollbacks?" }],
      },
    ]);
  });

  it("refuses a response with no text block", async () => {
    const { provider } = fakeMessagesApi([
      { type: "tool_use", id: "toolu_test", name: "lookup", input: {} },
    ]);

    await expect(provider.complete(ASK)).rejects.toThrow("No text content in Anthropic response");
  });

  it("refuses to run without ANTHROPIC_API_KEY, before any request", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { sent, provider } = fakeMessagesApi();

    await expect(provider.complete(ASK)).rejects.toThrow(
      "ANTHROPIC_API_KEY environment variable is required",
    );
    expect(sent).toEqual([]);
  });

  it("builds its client from ANTHROPIC_API_KEY on first use and keeps it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { sent, provider } = fakeMessagesApi();
    await expect(provider.complete(ASK)).rejects.toThrow();

    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    await provider.complete(ASK);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await provider.complete(ASK);

    expect(sent).toHaveLength(2);
  });

  it("is the provider the registry builds for anthropic", () => {
    expect(getLlmProvider("anthropic")).toBeInstanceOf(AnthropicLlmProvider);
  });
});

describe("anthropic llm provider request timeout", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    resetConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetConfig();
  });

  it.each([
    [undefined, "120"],
    ["", "120"],
    ["5000", "5"],
  ])("bounds a request at LLM_REQUEST_TIMEOUT_MS=%o, %s seconds", async (value, seconds) => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", value);
    const { timeouts, provider } = fakeMessagesApi();

    await provider.complete(ASK);

    expect(timeouts).toEqual([seconds]);
  });

  it("keeps a timeout the caller's client options set", async () => {
    const { timeouts, provider } = fakeMessagesApi(undefined, { timeout: 90_000 });

    await provider.complete(ASK);

    expect(timeouts).toEqual(["90"]);
  });

  it.each(["0", "-1", "1.5", "30s"])(
    "refuses LLM_REQUEST_TIMEOUT_MS=%o before any request",
    async (value) => {
      vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", value);
      const { sent, provider } = fakeMessagesApi();

      await expect(provider.complete(ASK)).rejects.toBeInstanceOf(ZodError);
      expect(sent).toEqual([]);
    },
  );

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
    const provider = new AnthropicLlmProvider({ fetch });

    let outcome: unknown = "waiting";
    provider.complete(ASK).then(
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
