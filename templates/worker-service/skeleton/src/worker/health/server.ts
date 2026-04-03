import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Logger } from "../logger.js";

// ── Health Server ─────────────────────────────────────────────────
//
// Minimal Hono HTTP server on a separate port for Kubernetes probes.
// /health always returns 200 (liveness). /readyz returns 200 only
// when the worker subsystems are running (readiness).
//

export interface HealthStatus {
  /** Whether the queue consumer is actively polling. */
  consumerPolling: () => boolean;

  /** Whether the cron scheduler is running (returns true if cron is disabled). */
  schedulerRunning: () => boolean;
}

export interface HealthServer {
  /** Start listening on the configured port. */
  start(): void;

  /** Stop the server. */
  stop(): Promise<void>;
}

/**
 * Create a health server that reports liveness and readiness based
 * on the provided status callbacks. The server runs on its own port
 * to keep health checks independent of the worker's job processing.
 */
export function createHealthServer(
  port: number,
  status: HealthStatus,
  logger: Logger
): HealthServer {
  const app = new Hono();
  let server: ReturnType<typeof serve> | null = null;

  // ── GET /health ───────────────────────────────────────────────
  // Liveness probe — always returns 200 if the process is alive.

  app.get("/health", (c) => {
    return c.json({ status: "alive" });
  });

  // ── GET /readyz ───────────────────────────────────────────────
  // Readiness probe — returns 200 only when consumer is polling
  // and scheduler is running (or cron is disabled).

  app.get("/readyz", (c) => {
    const consumerOk = status.consumerPolling();
    const schedulerOk = status.schedulerRunning();
    const ready = consumerOk && schedulerOk;

    if (!ready) {
      return c.json(
        {
          status: "not_ready",
          consumer: consumerOk ? "polling" : "stopped",
          scheduler: schedulerOk ? "running" : "stopped",
        },
        503
      );
    }

    return c.json({
      status: "ready",
      consumer: "polling",
      scheduler: "running",
    });
  });

  function start(): void {
    server = serve({ fetch: app.fetch, port }, () => {
      logger.info(`Health server listening on http://0.0.0.0:${port}`);
    });
  }

  async function stop(): Promise<void> {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
      logger.info("Health server stopped");
    }
  }

  return { start, stop };
}
