import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProvider } from "../providers/types.js";
import { CircuitBreakerOpenError } from "../resilience/circuit-breaker.js";
import { RequestTimeoutError } from "../resilience/request-timeout.js";
import type { ChatMessage, StreamResponse } from "../types.js";

// ── Provider Contract ──────────────────────────────────────────────
//
// Every provider that calls a model runs both request modes through one
// circuit breaker, bounds them by the request timeout its
// `requestTimeoutMs` option sets (a request by its whole reply, a stream
// by each wait for its next event), and aborts the request of a call it
// gives up on, which drops its connection. describeProviderContract()
// holds one provider to all three, over an endpoint that answers
// in-process: one whose stream sends its first event and then nothing, as
// a stalled connection does, and whose request never answers, or one that
// refuses every request. Each provider's request suite runs it, so the
// contract ships with the provider it covers.
//

/** The requestTimeoutMs every provider under the contract is built with. */
export const CONTRACT_TIMEOUT_MS = 5_000;

/** How the endpoint answers: stalls after a stream's first event, or refuses. */
export type Behaviour = "stalls" | "refuses";

/** What the endpoint saw. `aborted` is whether a stalled request's signal fired. */
export interface Endpoint {
  requests: number;
  aborted: boolean;
}

/** A provider's wire format: a stream's first event, and the body a refusal carries. */
export interface Wire {
  firstEvent: string;
  refusal: unknown;
}

/**
 * A `fetch` that behaves as `behaviour` says: a streamed request gets
 * `wire.firstEvent` and then nothing until its signal aborts, a request
 * that does not stream gets no answer until then, and a refused request
 * gets a 400 carrying `wire.refusal`.
 */
export function endpointFetch(behaviour: Behaviour, wire: Wire) {
  const endpoint: Endpoint = { requests: 0, aborted: false };
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    endpoint.requests += 1;
    if (behaviour === "refuses") return Response.json(wire.refusal, { status: 400 });
    const streamed =
      String(input).includes(":streamGenerateContent") ||
      JSON.parse(String(init?.body)).stream === true;
    const signal = init?.signal;
    if (!streamed) {
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          endpoint.aborted = true;
          reject(signal.reason);
        });
      });
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire.firstEvent));
        signal?.addEventListener("abort", () => {
          endpoint.aborted = true;
          controller.error(signal.reason);
        });
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  };
  return { endpoint, fetch: fetch as typeof globalThis.fetch };
}

export interface ProviderContract {
  /**
   * A provider built with `requestTimeoutMs: CONTRACT_TIMEOUT_MS` over an
   * endpoint that behaves as `behaviour` says.
   */
  create(behaviour: Behaviour): { endpoint: Endpoint; provider: LlmProvider };
  /** The error a request that outlasts the timeout fails with. */
  ChatTimeoutError: new (
    ...args: never[]
  ) => Error;
}

const messages: ChatMessage[] = [{ role: "user", content: "Say hello." }];

/** How `call` has settled so far: "waiting", "answered", or its error. */
function track(call: Promise<unknown>): { outcome: unknown } {
  const state: { outcome: unknown } = { outcome: "waiting" };
  call.then(
    () => {
      state.outcome = "answered";
    },
    (error: unknown) => {
      state.outcome = error;
    },
  );
  return state;
}

/**
 * Waits, on the real event loop, until a request reaches the endpoint: an
 * SDK can read its configuration from disk before it sends, which fake
 * timers do not wait for. The fake clock stands still meanwhile.
 */
async function untilSent(endpoint: Endpoint): Promise<void> {
  while (endpoint.requests === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function drain(response: StreamResponse): Promise<string> {
  const text: string[] = [];
  for await (const chunk of response) {
    text.push(chunk.text);
  }
  return text.join("");
}

/**
 * Reads `stream`, opened over an endpoint that stalls after its first
 * event, on fake timers, and holds it to waiting `timeoutMs` for the next
 * event and then failing, its response with it.
 */
export async function expectStallToFailAt(
  stream: StreamResponse,
  endpoint: Endpoint,
  timeoutMs: number,
): Promise<void> {
  const drained = track(drain(stream));
  await untilSent(endpoint);

  await vi.advanceTimersByTimeAsync(timeoutMs - 1);
  expect(drained.outcome).toBe("waiting");
  expect(endpoint.aborted).toBe(false);

  await vi.advanceTimersByTimeAsync(1);
  expect(drained.outcome).toBeInstanceOf(RequestTimeoutError);
  await expect(stream.response).rejects.toBeInstanceOf(RequestTimeoutError);
}

/**
 * Holds the provider `contract` builds to the contract: one circuit breaker
 * for both request modes, the request timeout, and aborting the request of
 * a call it gives up on.
 */
export function describeProviderContract(name: string, contract: ProviderContract): void {
  const { create, ChatTimeoutError } = contract;

  describe(`${name} provider breaker and timeouts`, () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("fails a stream that sends nothing for requestTimeoutMs after its first event", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { endpoint, provider } = create("stalls");

      await expectStallToFailAt(provider.streamChat(messages), endpoint, CONTRACT_TIMEOUT_MS);
      expect(endpoint.aborted).toBe(true);
    });

    it("fails a request that outlasts requestTimeoutMs", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { endpoint, provider } = create("stalls");

      const chat = track(provider.chat(messages));
      await untilSent(endpoint);

      await vi.advanceTimersByTimeAsync(CONTRACT_TIMEOUT_MS - 1);
      expect(chat.outcome).toBe("waiting");

      await vi.advanceTimersByTimeAsync(1);
      expect(chat.outcome).toBeInstanceOf(ChatTimeoutError);
      expect(endpoint.aborted).toBe(true);
    });

    it("opens its breaker on five refused streams and refuses the sixth unsent", async () => {
      const { endpoint, provider } = create("refuses");

      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(drain(provider.streamChat(messages))).rejects.not.toBeInstanceOf(
          CircuitBreakerOpenError,
        );
      }
      const refused = provider.streamChat(messages);

      await expect(drain(refused)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
      await expect(refused.response).rejects.toBeInstanceOf(CircuitBreakerOpenError);
      expect(endpoint.requests).toBe(5);
    });

    it("refuses a stream unsent while refused requests hold its breaker open", async () => {
      const { endpoint, provider } = create("refuses");

      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(provider.chat(messages)).rejects.not.toBeInstanceOf(CircuitBreakerOpenError);
      }

      await expect(drain(provider.streamChat(messages))).rejects.toBeInstanceOf(
        CircuitBreakerOpenError,
      );
      expect(endpoint.requests).toBe(5);
    });
  });
}
