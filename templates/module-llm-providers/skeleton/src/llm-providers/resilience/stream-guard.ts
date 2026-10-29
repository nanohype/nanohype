// ── Stream Guard ────────────────────────────────────────────────────
//
// Runs a provider's streamed reply as one call through the provider's
// circuit breaker, so streams and request/response calls open and close
// the same breaker. An open breaker refuses a stream before it sends a
// request. The call fails when opening the stream fails, the provider's
// stream fails, or the provider sends no event for the request timeout;
// it succeeds when the stream ends, or when the consumer stops reading
// early (`break`, or `return()` on the iterator). A failure the stream's
// `counts` hook declines fails the stream without counting against the
// breaker. The call starts at the
// consumer's first read and stays open while the stream does, so a
// consumer that leaves a stream unfinished without stopping it holds the
// call open.
//
// The timeout bounds each wait for the provider's next event, opening the
// stream included, rather than the whole stream. When it fires, or the
// consumer stops early, the signal handed to `open` aborts, which drops
// the connection of an SDK that takes the signal.
//
// `response` resolves with the whole reply before the final `done` chunk
// is yielded, so a consumer that stops at `done` still gets it. It
// rejects with the stream's error when the stream fails, and when the
// consumer stops before the reply finishes.
//

import type { LlmResponse, StreamChunk, StreamResponse } from "../types.js";
import type { createCircuitBreaker } from "./circuit-breaker.js";
import { withRequestTimeout } from "./request-timeout.js";

type CircuitBreaker = Pick<ReturnType<typeof createCircuitBreaker>, "execute">;

/** A provider's streamed reply, as guardStream() runs it. */
export interface GuardedStream<E> {
  /**
   * Opens the provider's stream of events: its SDK stream, or nothing when
   * the provider answered with no body to read. `signal` aborts when a wait
   * times out or the consumer stops early.
   */
  open(signal: AbortSignal): AsyncIterable<E> | undefined | Promise<AsyncIterable<E> | undefined>;
  /** The text `event` adds to the reply, if any. */
  text(event: E): string | undefined;
  /** The response for the whole reply, once the provider's stream has ended. */
  finish(text: string, latencyMs: number): LlmResponse | Promise<LlmResponse>;
  /**
   * Whether `error`, which failed the stream, counts against the breaker:
   * false for an answer about the request rather than the provider's
   * health. Every failure counts when unset.
   */
  counts?(error: unknown): boolean;
}

/** A StreamResponse over `stream`, run as one call through `cb`, waiting up to `timeoutMs` for each event. */
export function guardStream<E>(
  cb: CircuitBreaker,
  timeoutMs: number,
  stream: GuardedStream<E>,
): StreamResponse {
  let resolveResponse: (response: LlmResponse) => void = () => {};
  let rejectResponse: (error: unknown) => void = () => {};
  const response = new Promise<LlmResponse>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  // A consumer that reads only the chunks sees a failure there.
  response.catch(() => {});

  async function* chunks(): AsyncGenerator<StreamChunk> {
    let admit: () => void = () => {};
    let settle: (failure?: { error: unknown }) => void = () => {};
    const admitted = new Promise<void>((resolve) => {
      admit = resolve;
    });
    const call = cb.execute(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = (failure) => (failure ? reject(failure.error) : resolve());
          admit();
        }),
    );
    try {
      // `call` rejects before `admitted` resolves when the breaker refuses it.
      await Promise.race([admitted, call]);
    } catch (error) {
      rejectResponse(error);
      throw error;
    }
    // The stream throws its own failure; `call` only carries it to the breaker.
    call.catch(() => {});

    const controller = new AbortController();
    let source: AsyncIterator<E> | undefined;
    let finished = false;
    try {
      const start = performance.now();
      const events = await withRequestTimeout(
        timeoutMs,
        (signal) => stream.open(signal),
        controller,
      );
      const iterator = events?.[Symbol.asyncIterator]();
      source = iterator;
      let text = "";
      while (iterator) {
        const next = await withRequestTimeout(timeoutMs, () => iterator.next(), controller);
        if (next.done) break;
        const delta = stream.text(next.value);
        if (delta) {
          text += delta;
          yield { text: delta, done: false };
        }
      }
      resolveResponse(await stream.finish(text, performance.now() - start));
      finished = true;
      settle();
    } catch (error) {
      settle(stream.counts?.(error) === false ? undefined : { error });
      rejectResponse(error);
      throw error;
    } finally {
      if (!finished) {
        controller.abort();
        settle();
        rejectResponse(new Error("The stream closed before the reply finished"));
        source?.return?.()?.catch(() => {});
      }
    }
    yield { text: "", done: true };
  }

  const iterator = chunks();
  return {
    [Symbol.asyncIterator]() {
      return iterator;
    },
    response,
  };
}
