// ── Circuit Breaker ─────────────────────────────────────────────────
//
// Lightweight state machine: closed -> open -> half-open -> closed.
// Wraps async calls to external services. When failures within a
// sliding time window exceed the threshold, the breaker opens and
// fast-fails for resetTimeoutMs before probing with a single
// half-open request. Old failures decay naturally outside the window.
//
// NOTE: This implementation is duplicated across module-llm-providers,
// module-llm-gateway, module-vector-store, module-semantic-cache,
// and module-project-mgmt. These are standalone templates that cannot
// share code at runtime — keep all copies in sync when making changes.
//

export interface CircuitBreakerOptions {
  /** Failures within windowMs before opening. Default: 5 */
  failureThreshold?: number;
  /** Sliding window for counting failures in ms. Default: 60000 */
  windowMs?: number;
  /** Ms before transitioning open -> half-open. Default: 30000 */
  resetTimeoutMs?: number;
  /** Requests allowed in half-open. Default: 1 */
  halfOpenMax?: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super("Circuit breaker is open");
    this.name = "CircuitBreakerOpenError";
  }
}

type State = "closed" | "open" | "half-open";

export function createCircuitBreaker(opts: CircuitBreakerOptions = {}) {
  const threshold = opts.failureThreshold ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const resetTimeout = opts.resetTimeoutMs ?? 30_000;
  const halfOpenMax = opts.halfOpenMax ?? 1;

  let state: State = "closed";
  let failureTimestamps: number[] = [];
  let lastFailureTime = 0;
  let halfOpenAttempts = 0;
  let probing = false;

  /** Count failures within the sliding window, pruning expired entries. */
  function recentFailures(): number {
    const cutoff = Date.now() - windowMs;
    failureTimestamps = failureTimestamps.filter((t) => t > cutoff);
    return failureTimestamps.length;
  }

  function getState(): State {
    return state;
  }

  async function execute<T>(fn: () => Promise<T>): Promise<T> {
    if (state === "open") {
      if (Date.now() - lastFailureTime >= resetTimeout) {
        // Safe because JavaScript is single-threaded and there is no await between check and set
        if (probing) throw new CircuitBreakerOpenError();
        state = "half-open";
        halfOpenAttempts = 0;
        probing = true;
      } else {
        throw new CircuitBreakerOpenError();
      }
    }

    if (state === "half-open") {
      if (halfOpenAttempts >= halfOpenMax && !probing) {
        throw new CircuitBreakerOpenError();
      }
      // Concurrent callers that aren't the prober fast-fail
      if (!probing) throw new CircuitBreakerOpenError();
    }

    try {
      if (state === "half-open") halfOpenAttempts++;
      const result = await fn();
      // Success — full reset
      failureTimestamps = [];
      state = "closed";
      probing = false;
      return result;
    } catch (error) {
      const now = Date.now();
      failureTimestamps.push(now);
      lastFailureTime = now;
      if (state === "half-open" || recentFailures() >= threshold) {
        state = "open";
      }
      probing = false;
      throw error;
    }
  }

  function reset() {
    state = "closed";
    failureTimestamps = [];
    halfOpenAttempts = 0;
    probing = false;
  }

  return { execute, getState, reset };
}
