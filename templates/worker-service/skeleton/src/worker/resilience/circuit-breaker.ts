// ── Circuit Breaker ───────────────────────────────────────────────
//
// Protects external calls from cascading failures. The breaker
// tracks consecutive failures and opens the circuit when a threshold
// is reached. While open, calls fail immediately without hitting the
// external service. After a reset timeout, the breaker enters
// half-open state and allows a single probe call through.
//
// No mutable module state — each createCircuitBreaker() call returns
// an isolated instance.
//

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit (default: 5). */
  failureThreshold?: number;

  /** Time in ms to wait before transitioning from open to half-open (default: 30000). */
  resetTimeout?: number;
}

export interface CircuitBreaker {
  /** Execute a function through the circuit breaker. */
  call<T>(fn: () => Promise<T>): Promise<T>;

  /** Current state of the circuit. */
  readonly state: CircuitState;

  /** Number of consecutive failures in the current closed window. */
  readonly failures: number;

  /** Manually reset the breaker to closed state. */
  reset(): void;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeout: 30_000,
};

/**
 * Create a circuit breaker instance. Each instance maintains its own
 * failure counter and state — no shared mutable module state.
 */
export function createCircuitBreaker(opts?: CircuitBreakerOptions): CircuitBreaker {
  const failureThreshold = opts?.failureThreshold ?? DEFAULTS.failureThreshold;
  const resetTimeout = opts?.resetTimeout ?? DEFAULTS.resetTimeout;

  let state: CircuitState = "closed";
  let failures = 0;
  let lastFailureTime = 0;

  function tryTransition(): void {
    if (state === "open" && Date.now() - lastFailureTime >= resetTimeout) {
      state = "half-open";
    }
  }

  function onSuccess(): void {
    failures = 0;
    state = "closed";
  }

  function onFailure(): void {
    failures++;
    lastFailureTime = Date.now();

    if (failures >= failureThreshold) {
      state = "open";
    }
  }

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    tryTransition();

    if (state === "open") {
      throw new Error("Circuit breaker is open — call rejected");
    }

    try {
      const result = await fn();
      onSuccess();
      return result;
    } catch (err) {
      onFailure();
      throw err;
    }
  }

  function reset(): void {
    state = "closed";
    failures = 0;
    lastFailureTime = 0;
  }

  return {
    call,
    get state() {
      tryTransition();
      return state;
    },
    get failures() {
      return failures;
    },
    reset,
  };
}
