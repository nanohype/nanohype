// ── Upstream Health Checker ──────────────────────────────────────────
//
// Periodically pings upstream /health endpoints and tracks consecutive
// failures. After reaching the unhealthy threshold (default 3), the
// upstream is marked unhealthy and removed from the routing pool.
// Healthy checks restore it. All state is instance-scoped within the
// HealthChecker — no module-level mutable state.
//

import type { Logger } from "../logger.js";
import { gatewayUpstreamHealth } from "../metrics.js";

/** Health state for a single upstream. */
interface UpstreamHealthState {
  url: string;
  healthPath: string;
  intervalMs: number;
  unhealthyThreshold: number;
  healthy: boolean;
  consecutiveFailures: number;
  timer: ReturnType<typeof setInterval> | null;
}

/** Configuration for registering an upstream with the health checker. */
export interface HealthCheckTarget {
  url: string;
  healthPath?: string;
  intervalMs?: number;
  unhealthyThreshold?: number;
}

/** Callback invoked when an upstream's health status changes. */
export type HealthChangeCallback = (url: string, healthy: boolean) => void;

/**
 * Create a health checker instance. All state (upstream registry,
 * timers, callbacks) is scoped to the returned object.
 */
export function createHealthChecker(logger: Logger) {
  const upstreams = new Map<string, UpstreamHealthState>();
  const listeners: HealthChangeCallback[] = [];

  /**
   * Perform a single health check against an upstream. Updates the
   * consecutive failure counter and triggers status change events.
   */
  async function check(state: UpstreamHealthState): Promise<void> {
    const url = `${state.url}${state.healthPath}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        if (!state.healthy) {
          state.healthy = true;
          state.consecutiveFailures = 0;
          logger.info("Upstream recovered", { upstream: state.url });
          gatewayUpstreamHealth.add(1, { upstream: state.url });
          for (const cb of listeners) cb(state.url, true);
        }
        state.consecutiveFailures = 0;
      } else {
        handleFailure(state);
      }
    } catch {
      handleFailure(state);
    }
  }

  function handleFailure(state: UpstreamHealthState): void {
    state.consecutiveFailures += 1;

    if (state.healthy && state.consecutiveFailures >= state.unhealthyThreshold) {
      state.healthy = false;
      logger.warn("Upstream marked unhealthy", {
        upstream: state.url,
        consecutiveFailures: state.consecutiveFailures,
      });
      gatewayUpstreamHealth.add(-1, { upstream: state.url });
      for (const cb of listeners) cb(state.url, false);
    }
  }

  return {
    /**
     * Register an upstream for periodic health checking. Starts the
     * check interval immediately.
     */
    register(target: HealthCheckTarget): void {
      if (upstreams.has(target.url)) return;

      const state: UpstreamHealthState = {
        url: target.url,
        healthPath: target.healthPath ?? "/health",
        intervalMs: target.intervalMs ?? 30_000,
        unhealthyThreshold: target.unhealthyThreshold ?? 3,
        healthy: true,
        consecutiveFailures: 0,
        timer: null,
      };

      state.timer = setInterval(() => {
        check(state).catch(() => {
          // Errors are handled inside check()
        });
      }, state.intervalMs);

      upstreams.set(target.url, state);
      gatewayUpstreamHealth.add(1, { upstream: target.url });
      logger.info("Registered upstream for health checking", {
        upstream: target.url,
        intervalMs: state.intervalMs,
      });
    },

    /**
     * Unregister an upstream and stop its health check timer.
     */
    unregister(url: string): void {
      const state = upstreams.get(url);
      if (!state) return;
      if (state.timer) clearInterval(state.timer);
      upstreams.delete(url);
    },

    /**
     * Check whether a specific upstream is currently healthy.
     */
    isHealthy(url: string): boolean {
      const state = upstreams.get(url);
      return state?.healthy ?? true;
    },

    /**
     * Register a callback for upstream health status changes.
     */
    onChange(callback: HealthChangeCallback): void {
      listeners.push(callback);
    },

    /**
     * Stop all health check timers and clean up.
     */
    shutdown(): void {
      for (const state of upstreams.values()) {
        if (state.timer) clearInterval(state.timer);
      }
      upstreams.clear();
      listeners.length = 0;
    },

    /**
     * Get a snapshot of all upstream health states (for diagnostics).
     */
    status(): Array<{ url: string; healthy: boolean; consecutiveFailures: number }> {
      return Array.from(upstreams.values()).map((s) => ({
        url: s.url,
        healthy: s.healthy,
        consecutiveFailures: s.consecutiveFailures,
      }));
    },
  };
}

/** Type for the health checker instance returned by createHealthChecker. */
export type HealthChecker = ReturnType<typeof createHealthChecker>;
