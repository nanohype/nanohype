import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmResponse, StreamChunk, StreamResponse } from "../../types.js";
import { CircuitBreakerOpenError, createCircuitBreaker } from "../circuit-breaker.js";
import { RequestTimeoutError } from "../request-timeout.js";
import { type GuardedStream, guardStream } from "../stream-guard.js";

// ── Stream Guard Tests ─────────────────────────────────────────────
//
// guardStream() runs a provider's stream as one call through its circuit
// breaker, bounds each wait for the stream's next event, and settles the
// stream's `response`. These drive it over a scripted stream of text
// events with a real breaker and fake timers, so every outcome is the
// breaker's own state and every timeout lands on its exact millisecond.
//

const TIMEOUT_MS = 1_000;

/**
 * A provider's stream of text events, scripted by `send`, `end` and `fail`.
 * An event the guard has not asked for yet waits for it, as a socket
 * buffers what arrives before it is read.
 */
function scriptedStream() {
  const state = {
    opened: 0,
    signal: undefined as AbortSignal | undefined,
    returned: false,
  };
  type Arrival = IteratorResult<string> | { error: unknown };
  const arrived: Arrival[] = [];
  let reader: ((arrival: Arrival) => void) | undefined;
  const settle = (arrival: Arrival): Promise<IteratorResult<string>> =>
    "error" in arrival ? Promise.reject(arrival.error) : Promise.resolve(arrival);
  const arrive = (arrival: Arrival) => {
    if (reader) {
      const read = reader;
      reader = undefined;
      read(arrival);
    } else {
      arrived.push(arrival);
    }
  };
  const events: AsyncIterator<string> = {
    next: () => {
      const arrival = arrived.shift();
      if (arrival) return settle(arrival);
      return new Promise<Arrival>((resolve) => {
        reader = resolve;
      }).then(settle);
    },
    return: async () => {
      state.returned = true;
      return { value: undefined, done: true };
    },
  };
  const stream: GuardedStream<string> = {
    open(signal) {
      state.opened += 1;
      state.signal = signal;
      return { [Symbol.asyncIterator]: () => events };
    },
    text: (event) => event,
    finish: (text, latencyMs): LlmResponse => ({
      text,
      model: "test-model",
      provider: "test",
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs,
      cost: 0,
    }),
  };
  return {
    state,
    stream,
    send: (text: string) => arrive({ value: text, done: false }),
    end: () => arrive({ value: undefined, done: true }),
    fail: (error: unknown) => arrive({ error }),
  };
}

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

async function drain(response: StreamResponse): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of response) chunks.push(chunk);
  return chunks;
}

/** A stream the provider refuses as it opens. */
function refusedStream(): GuardedStream<string> {
  return {
    open: () => Promise.reject(new Error("refused")),
    text: (event) => event,
    finish: () => Promise.reject(new Error("unreachable")),
  };
}

describe("guardStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("yields each event's text, then resolves the response before the done chunk", async () => {
    const cb = createCircuitBreaker();
    const script = scriptedStream();
    const response = guardStream(cb, TIMEOUT_MS, script.stream);
    const iterator = response[Symbol.asyncIterator]();

    script.send("Hel");
    expect(await iterator.next()).toEqual({ value: { text: "Hel", done: false }, done: false });

    script.send("lo.");
    expect(await iterator.next()).toEqual({ value: { text: "lo.", done: false }, done: false });

    script.end();
    expect(await iterator.next()).toEqual({ value: { text: "", done: true }, done: false });
    // The response has resolved by the time the done chunk arrives: a race
    // against a value that is already there goes to the response only then.
    await expect(Promise.race([response.response, "pending"])).resolves.toMatchObject({
      text: "Hello.",
    });
    // A consumer that stops at `done` keeps the whole reply.
    await iterator.return?.();
    await expect(response.response).resolves.toMatchObject({ text: "Hello." });
    expect(script.state.signal?.aborted).toBe(false);
  });

  it("fails the stream and its response when the provider's stream fails", async () => {
    const cb = createCircuitBreaker();
    const script = scriptedStream();
    const response = guardStream(cb, TIMEOUT_MS, script.stream);

    script.send("Hel");
    script.fail(new Error("reset"));

    await expect(drain(response)).rejects.toThrow("reset");
    await expect(response.response).rejects.toThrow("reset");
  });

  it("fails a wait for the next event at the timeout, and aborts the signal", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cb = createCircuitBreaker();
    const script = scriptedStream();
    const response = guardStream(cb, TIMEOUT_MS, script.stream);

    const drained = track(drain(response));
    await vi.advanceTimersByTimeAsync(0);
    script.send("Hel");

    // Each event restarts the wait, so a stream that keeps arriving is never cut off.
    for (let event = 0; event < 3; event++) {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
      script.send("lo");
    }
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(drained.outcome).toBe("waiting");
    expect(script.state.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(drained.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(drained.outcome).toMatchObject({ timeoutMs: TIMEOUT_MS });
    expect(script.state.signal?.aborted).toBe(true);
    expect(script.state.returned).toBe(true);
    await expect(response.response).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it("fails a stream whose opening outlasts the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cb = createCircuitBreaker();
    let signal: AbortSignal | undefined;
    const hung: GuardedStream<string> = {
      open: (s) => {
        signal = s;
        return new Promise<never>(() => {});
      },
      text: (event) => event,
      finish: () => Promise.reject(new Error("unreachable")),
    };

    const drained = track(drain(guardStream(cb, TIMEOUT_MS, hung)));

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(drained.outcome).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(drained.outcome).toBeInstanceOf(RequestTimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  it("aborts the signal and closes the provider's stream when the consumer stops early", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    const script = scriptedStream();
    const response = guardStream(cb, TIMEOUT_MS, script.stream);

    script.send("Hel");
    for await (const chunk of response) {
      expect(chunk.text).toBe("Hel");
      break;
    }

    expect(script.state.signal?.aborted).toBe(true);
    expect(script.state.returned).toBe(true);
    await expect(response.response).rejects.toThrow("The stream closed before the reply finished");
    // Stopping early is the consumer's choice, not a failure of the provider.
    expect(cb.getState()).toBe("closed");
  });

  it("finishes an empty stream", async () => {
    const cb = createCircuitBreaker();
    const empty: GuardedStream<string> = {
      open: () => undefined,
      text: (event) => event,
      finish: (text, latencyMs) => ({
        text,
        model: "test-model",
        provider: "test",
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs,
        cost: 0,
      }),
    };
    const response = guardStream(cb, TIMEOUT_MS, empty);

    expect(await drain(response)).toEqual([{ text: "", done: true }]);
    await expect(response.response).resolves.toMatchObject({ text: "" });
  });
});

describe("guardStream and the circuit breaker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the breaker on five failed streams and refuses the sixth before opening it", async () => {
    const cb = createCircuitBreaker();
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(drain(guardStream(cb, TIMEOUT_MS, refusedStream()))).rejects.toThrow("refused");
    }
    expect(cb.getState()).toBe("open");

    const script = scriptedStream();
    const refused = guardStream(cb, TIMEOUT_MS, script.stream);

    await expect(drain(refused)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    await expect(refused.response).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(script.state.opened).toBe(0);
  });

  it("opens the breaker on five streams that time out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cb = createCircuitBreaker();

    for (let attempt = 0; attempt < 5; attempt++) {
      const drained = track(drain(guardStream(cb, TIMEOUT_MS, scriptedStream().stream)));
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
      expect(drained.outcome).toBeInstanceOf(RequestTimeoutError);
    }

    expect(cb.getState()).toBe("open");
  });

  it("refuses a stream while a breaker the provider's other calls opened stays open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    await expect(cb.execute(() => Promise.reject(new Error("refused")))).rejects.toThrow();

    const script = scriptedStream();
    await expect(drain(guardStream(cb, TIMEOUT_MS, script.stream))).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );
    expect(script.state.opened).toBe(0);
  });

  it("closes the breaker when a stream finishes", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 2 });
    await expect(drain(guardStream(cb, TIMEOUT_MS, refusedStream()))).rejects.toThrow("refused");

    const script = scriptedStream();
    script.end();
    await drain(guardStream(cb, TIMEOUT_MS, script.stream));

    // The earlier failure no longer counts toward the threshold.
    await expect(drain(guardStream(cb, TIMEOUT_MS, refusedStream()))).rejects.toThrow("refused");
    expect(cb.getState()).toBe("closed");
  });

  it("closes a half-open breaker when the probing stream finishes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10 });
    await expect(drain(guardStream(cb, TIMEOUT_MS, refusedStream()))).rejects.toThrow("refused");
    vi.advanceTimersByTime(10);

    const probe = scriptedStream();
    const drained = drain(guardStream(cb, TIMEOUT_MS, probe.stream));
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.getState()).toBe("half-open");

    probe.end();
    await drained;
    expect(cb.getState()).toBe("closed");
  });
});
