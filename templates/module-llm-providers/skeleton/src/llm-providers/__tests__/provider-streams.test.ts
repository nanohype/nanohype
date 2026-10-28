import { APIConnectionTimeoutError as AnthropicTimeoutError } from "@anthropic-ai/sdk";
import { APIConnectionTimeoutError as GroqTimeoutError } from "groq-sdk";
import { APIConnectionTimeoutError as OpenAITimeoutError } from "openai";
import { afterEach, describe, it, vi } from "vitest";
import { createAnthropicProvider } from "../providers/anthropic.js";
import { createGroqProvider } from "../providers/groq.js";
import { createOpenAIProvider } from "../providers/openai.js";
import type { LlmProvider } from "../providers/types.js";
import {
  CONTRACT_TIMEOUT_MS,
  describeProviderContract,
  endpointFetch,
  expectStallToFailAt,
  type Wire,
} from "./provider-contract.js";

// ── Provider Stream Tests ──────────────────────────────────────────
//
// Holds the anthropic, openai and groq providers to the breaker and
// timeout contract provider-contract.ts gives, each running its real SDK
// client over an in-process `fetch`. Every other provider that calls a
// model runs the contract from its own request suite. A `timeout` in these
// providers' client options takes the place of `requestTimeoutMs`, for the
// SDK's bound on a request and for the provider's bound on each wait for a
// stream's next event alike.
//

const COMPLETION_CHUNK = `data: ${JSON.stringify({
  id: "chatcmpl-test",
  object: "chat.completion.chunk",
  created: 0,
  model: "test-model",
  choices: [{ index: 0, delta: { content: "Hel" }, finish_reason: null }],
})}\n\n`;

const COMPLETIONS_REFUSAL = { error: { message: "refused", type: "invalid_request_error" } };

const ANTHROPIC_WIRE: Wire = {
  firstEvent: `event: message_start\ndata: ${JSON.stringify({
    type: "message_start",
    message: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 0 },
    },
  })}\n\n`,
  refusal: { type: "error", error: { type: "invalid_request_error", message: "refused" } },
};

const COMPLETIONS_WIRE: Wire = { firstEvent: COMPLETION_CHUNK, refusal: COMPLETIONS_REFUSAL };

describeProviderContract("anthropic", {
  create(behaviour) {
    const { endpoint, fetch } = endpointFetch(behaviour, ANTHROPIC_WIRE);
    const provider = createAnthropicProvider({
      requestTimeoutMs: CONTRACT_TIMEOUT_MS,
      client: { apiKey: "test-key", maxRetries: 0, fetch },
    });
    return { endpoint, provider };
  },
  ChatTimeoutError: AnthropicTimeoutError,
});

describeProviderContract("openai", {
  create(behaviour) {
    const { endpoint, fetch } = endpointFetch(behaviour, COMPLETIONS_WIRE);
    const provider = createOpenAIProvider({
      requestTimeoutMs: CONTRACT_TIMEOUT_MS,
      client: { apiKey: "test-key", maxRetries: 0, fetch },
    });
    return { endpoint, provider };
  },
  ChatTimeoutError: OpenAITimeoutError,
});

describeProviderContract("groq", {
  create(behaviour) {
    const { endpoint, fetch } = endpointFetch(behaviour, COMPLETIONS_WIRE);
    const provider = createGroqProvider({
      requestTimeoutMs: CONTRACT_TIMEOUT_MS,
      client: { apiKey: "test-key", maxRetries: 0, fetch },
    });
    return { endpoint, provider };
  },
  ChatTimeoutError: GroqTimeoutError,
});

describe("a timeout in the client options", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const builds: [string, Wire, (client: ClientWithTimeout) => LlmProvider][] = [
    [
      "anthropic",
      ANTHROPIC_WIRE,
      (client) => createAnthropicProvider({ requestTimeoutMs: 60_000, client }),
    ],
    [
      "openai",
      COMPLETIONS_WIRE,
      (client) => createOpenAIProvider({ requestTimeoutMs: 60_000, client }),
    ],
    [
      "groq",
      COMPLETIONS_WIRE,
      (client) => createGroqProvider({ requestTimeoutMs: 60_000, client }),
    ],
  ];

  it.each(builds)(
    "%s: bounds each wait for a stream's next event over requestTimeoutMs",
    async (_name, wire, build) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { endpoint, fetch } = endpointFetch("stalls", wire);
      const provider = build({
        apiKey: "test-key",
        maxRetries: 0,
        timeout: CONTRACT_TIMEOUT_MS,
        fetch,
      });

      await expectStallToFailAt(
        provider.streamChat([{ role: "user", content: "Say hello." }]),
        endpoint,
        CONTRACT_TIMEOUT_MS,
      );
    },
  );
});

/** The client options each build passes: a key, no retries, a timeout and the endpoint's fetch. */
interface ClientWithTimeout {
  apiKey: string;
  maxRetries: number;
  timeout: number;
  fetch: typeof globalThis.fetch;
}
