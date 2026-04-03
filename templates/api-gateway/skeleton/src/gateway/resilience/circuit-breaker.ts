// ── Per-Upstream Circuit Breaker ─────────────────────────────────────
//
// Sliding-window circuit breaker that tracks failure rates per upstream.
// All state is instance-scoped — each call to createCircuitBreaker()
// returns an independent breaker with its own window and counters.
//
// States:
//   CLOSED  — requests flow normally, failures are counted
//   OPEN    — requests are rejected immediately (fail fast)
//   HALF    — a single probe request is allowed through to test recovery
//
// The window slides based on wall time, discarding entries older than
// the configured window duration.
//

import type { Logger } from "../logger.js";

export type CircuitState = "closed" | "open" | "half-open";

/** Configuration for a circuit breaker instance. */
export interface CircuitBreakerConfig {
  /** Failure rate threshold (0-1) to trip the breaker (default: 0.5). */
  failureThreshold?: number;

  /** Minimum number of requests in the window before the threshold applies (default: 5). */
  minimumRequests?: number;

  /** Sliding window duration in milliseconds (default: 60000). */
  windowMs?: number;

  /** Time in milliseconds to stay open before transitioning to half-open (default: 30000). */
  openDurationMs?: number;
}

/** Entry in the sliding window. */
interface WindowEntry {
  timestamp: number;
  success: boolean;
}

/**
 * Create a circuit breaker for a single upstream. Returns an
 * instance-scoped breaker — no shared module-level mutable state.
 */
export function createCircuitBreaker(
  upstreamUrl: string,
  logger: Logger,
  config?: CircuitBreakerConfig,
) {
  const failureThreshold = config?.failureThreshold ?? 0.5;
  const minimumRequests = config?.minimumRequests ?? 5;
  const windowMs = config?.windowMs ?? 60_000;
  const openDurationMs = config?.openDurationMs ?? 30_000;

  let state: CircuitState = "closed";
  let openedAt = 0;
  const window: WindowEntry[] = [];

  /** Remove entries outside the sliding window. */
  function pruneWindow(): void {
    const cutoff = Date.now() - windowMs;
    while (window.length > 0 && window[0]!.timestamp < cutoff) {
      window.shift();
    }
  }

  /** Calculate the current failure rate within the window. */
  function failureRate(): number {
    pruneWindow();
    if (window.length === 0) return 0;
    const failures = window.filter((e) => !e.success).length;
    return failures / window.length;
  }

  /** Check if the breaker should transition from open to half-open. */
  function maybeTransition(): void {
    if (state === "open" && Date.now() - openedAt >= openDurationMs) {
      state = "half-open";
      logger.info("Circuit breaker half-open", { upstream: upstreamUrl });
    }
  }

  return {
    /** Get the current circuit state. */
    get state(): CircuitState {
      maybeTransition();
      return state;
    },

    /**
     * Check whether a request should be allowed through. Returns true
     * if the circuit is closed or half-open, false if open.
     */
    allowRequest(): boolean {
      maybeTransition();

      if (state === "closed") return true;
      if (state === "half-open") return true;
      return false;
    },

    /**
     * Record a successful request. In half-open state, a success
     * closes the circuit and resets the window.
     */
    recordSuccess(): void {
      window.push({ timestamp: Date.now(), success: true });

      if (state === "half-open") {
        state = "closed";
        window.length = 0;
        logger.info("Circuit breaker closed (recovered)", {
          upstream: upstreamUrl,
        });
      }
    },

    /**
     * Record a failed request. If the failure rate exceeds the
     * threshold (and minimum request count is met), the circuit opens.
     * In half-open state, a single failure reopens the circuit.
     */
    recordFailure(): void {
      window.push({ timestamp: Date.now(), success: false });

      if (state === "half-open") {
        state = "open";
        openedAt = Date.now();
        logger.warn("Circuit breaker reopened from half-open", {
          upstream: upstreamUrl,
        });
        return;
      }

      pruneWindow();
      if (window.length >= minimumRequests && failureRate() >= failureThreshold) {
        state = "open";
        openedAt = Date.now();
        logger.warn("Circuit breaker opened", {
          upstream: upstreamUrl,
          failureRate: failureRate(),
          windowSize: window.length,
        });
      }
    },

    /** Reset the circuit breaker to closed state with an empty window. */
    reset(): void {
      state = "closed";
      openedAt = 0;
      window.length = 0;
    },

    /** Get diagnostic info about the circuit breaker state. */
    stats() {
      pruneWindow();
      return {
        state: state as CircuitState,
        failureRate: failureRate(),
        windowSize: window.length,
        upstreamUrl,
      };
    },
  };
}

/** Type for the circuit breaker instance returned by createCircuitBreaker. */
export type CircuitBreaker = ReturnType<typeof createCircuitBreaker>;
