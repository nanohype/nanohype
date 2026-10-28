// ── Circuit Breaker ────────────────────────────────────────────────
//
// Protects external API calls (Stripe, etc.) from cascade failures.
// Three states: closed (healthy), open (failing — fast-reject), and
// half-open (probing — allow limited attempts). Transitions based
// on consecutive failure counts and a reset timeout.
//
// Only an error that says the dependency is unavailable should count.
// A dependency that answers "no" — a declined card, an invalid request —
// is healthy, and opening the circuit on those answers would turn one
// customer's bad input into an outage for every customer. `isFailure`
// draws that line for the caller's dependency.
//

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. */
  failureThreshold: number;

  /** Milliseconds to wait before transitioning from open to half-open. */
  resetTimeout: number;

  /** Maximum attempts allowed in half-open state before re-opening. */
  halfOpenMaxAttempts: number;

  /**
   * Decides whether an error counts toward opening the circuit. An error it
   * rejects shows the dependency answered, so it resets the failure count the
   * way a success does; the error still propagates to the caller. When
   * omitted, every error counts.
   */
  isFailure?: (err: unknown) => boolean;
}

type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private halfOpenAttempts = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /** Execute a function through the circuit breaker. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeout) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
      } else {
        throw new Error("Circuit breaker is open — request rejected");
      }
    }

    if (this.state === "half-open") {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts > this.config.halfOpenMaxAttempts) {
        this.state = "open";
        this.lastFailureTime = Date.now();
        throw new Error("Circuit breaker is open — half-open attempts exceeded");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      if (this.config.isFailure?.(err) ?? true) {
        this.onFailure();
      } else {
        this.onSuccess();
      }
      throw err;
    }
  }

  /** Get the current circuit state. */
  getState(): CircuitState {
    return this.state;
  }

  /** Get the current failure count. */
  getFailureCount(): number {
    return this.failures;
  }

  /** Reset the circuit breaker to closed state. */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = 0;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.halfOpenAttempts = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      this.state = "open";
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = "open";
    }
  }
}
