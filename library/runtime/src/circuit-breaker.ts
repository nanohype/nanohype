/**
 * Circuit breaker for external-IO calls.
 *
 * Design choice: of the three breaker semantics in the fleet —
 * consecutive-failure counter, timer-driven window, and sliding-window —
 * this module adopts the sliding-window design because it is the most
 * accurate account of downstream health (old failures decay naturally
 * instead of counting forever or resetting on a single success) and the
 * only one that is fully deterministic in tests: it holds no timers and
 * reads time exclusively through the injected `now()`, so a test ticks a
 * fake clock synchronously instead of racing the wall clock.
 *
 * State machine: closed → open → half_open → closed.
 *
 * - closed: calls pass through; each failure is stamped with `now()` and
 *   pruned from the log once it falls outside `windowMs`. When the count
 *   within the window reaches `failureThreshold`, the breaker opens.
 * - open: calls fail fast with `CircuitOpenError` until a cooldown of
 *   `halfOpenAfterMs` elapses.
 * - half_open: exactly ONE probe at a time — success closes the breaker
 *   and clears the window; failure (or a concurrent call while the probe
 *   is in flight) goes straight back to open with a fresh `openedAt`.
 *
 * `onOpen` fires once per closed→open transition (not on every rejection
 * while already open), so a counter wired here matches the number of
 * trips, not the blast radius. `reset()` is an operator override that
 * force-closes and clears failure history.
 *
 * Zero dependencies. Observability is the caller's concern — wire
 * `onOpen` into whatever metrics surface the consumer has.
 */

export type CircuitState = "closed" | "open" | "half_open";

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`circuit open: ${name}`);
    this.name = "CircuitOpenError";
  }
}

export interface CircuitBreaker {
  exec<T>(fn: () => Promise<T>): Promise<T>;
  state(): CircuitState;
  /** Force-close (operator override). Clears failure history. */
  reset(): void;
}

export interface CircuitBreakerConfig {
  /** Identifier used in errors and the `onOpen` callback. */
  name: string;
  /** Failures within `windowMs` to trip the breaker (closed → open). */
  failureThreshold: number;
  /** Rolling-window size for failure accounting, in ms. */
  windowMs: number;
  /** Cooldown after opening before a single half-open probe is allowed, in ms. */
  halfOpenAfterMs: number;
  /** Clock override. Defaults to `Date.now`. Tests inject a fake clock. */
  now?: () => number;
  /** Emitted once per closed→open transition. */
  onOpen?: (name: string) => void;
}

export function createCircuitBreaker(cfg: CircuitBreakerConfig): CircuitBreaker {
  const now = cfg.now ?? (() => Date.now());

  let state: CircuitState = "closed";
  let failures: number[] = [];
  let openedAt = 0;
  let halfOpenInFlight = false;

  function pruneFailures(t: number): void {
    const cutoff = t - cfg.windowMs;
    if (failures.length === 0) return;
    if (failures[0] >= cutoff) return;
    failures = failures.filter((ts) => ts >= cutoff);
  }

  function tripOpen(t: number): void {
    state = "open";
    openedAt = t;
    failures = [];
    cfg.onOpen?.(cfg.name);
  }

  function maybeEnterHalfOpen(t: number): void {
    if (state !== "open") return;
    if (t - openedAt >= cfg.halfOpenAfterMs) {
      state = "half_open";
      halfOpenInFlight = false;
    }
  }

  return {
    state: () => state,

    reset(): void {
      state = "closed";
      failures = [];
      halfOpenInFlight = false;
    },

    async exec<T>(fn: () => Promise<T>): Promise<T> {
      const t = now();

      if (state === "open") {
        maybeEnterHalfOpen(t);
        if (state === "open") {
          throw new CircuitOpenError(cfg.name);
        }
      }

      if (state === "half_open") {
        if (halfOpenInFlight) {
          // Only one probe at a time — reject fast so we don't pile on the
          // downstream while waiting for the canary to resolve.
          throw new CircuitOpenError(cfg.name);
        }
        halfOpenInFlight = true;
        try {
          const result = await fn();
          state = "closed";
          failures = [];
          halfOpenInFlight = false;
          return result;
        } catch (err) {
          halfOpenInFlight = false;
          tripOpen(now());
          throw err;
        }
      }

      // closed
      try {
        return await fn();
      } catch (err) {
        const failedAt = now();
        pruneFailures(failedAt);
        failures.push(failedAt);
        if (failures.length >= cfg.failureThreshold) {
          tripOpen(failedAt);
        }
        throw err;
      }
    },
  };
}
