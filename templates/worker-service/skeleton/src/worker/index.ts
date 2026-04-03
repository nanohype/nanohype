import "dotenv/config";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import type { WorkerConfig } from "./types.js";
import type { HandlerMap } from "./consumer/types.js";
import { createQueueConsumer } from "./consumer/handler.js";
import { createHealthServer } from "./health/server.js";
import { sendNotification } from "./consumer/jobs/example.js";

// ── Bootstrap ───────────────────────────────────────────────────────
//
// 1. Validate that all scaffolding placeholders have been replaced.
// 2. Validate configuration (exits on invalid env vars).
// 3. Create logger instance.
// 4. Build job handler map and queue provider.
// 5. Optionally start cron scheduler.
// 6. Start queue consumer.
// 7. Start health HTTP server.
// 8. Wire graceful shutdown.
//

validateBootstrap();

const config = loadConfig();
const logger = createLogger(config.logLevel as "info", "worker");

logger.info("__PROJECT_NAME__ starting", {
  queueProvider: config.queueProvider,
  cronEnabled: config.cronEnabled,
  healthPort: config.healthPort,
});

// ── Queue Provider ──────────────────────────────────────────────────
//
// In-memory provider for development. Swap for a real provider
// (BullMQ, SQS, etc.) by importing and instantiating the appropriate
// module. See the module-queue template for pluggable providers.
//

const memoryProvider = createMemoryProvider();

// ── Job Handlers ────────────────────────────────────────────────────

const handlers: HandlerMap = {
  "send-notification": sendNotification,
};

// ── Consumer ────────────────────────────────────────────────────────

const consumer = createQueueConsumer(memoryProvider, handlers, logger.child("consumer"), {
  pollInterval: config.pollInterval,
  concurrency: config.concurrency,
});

consumer.start();

// ── Cron Scheduler ──────────────────────────────────────────────────

let schedulerRunning = !config.cronEnabled;

if (config.cronEnabled) {
  import("./scheduler/cron.js").then(async ({ createCronScheduler }) => {
    const { cleanupStaleData } = await import("./scheduler/jobs/example.js");

    const scheduler = createCronScheduler(logger.child("scheduler"));
    scheduler.register(cleanupStaleData);
    scheduler.start();
    schedulerRunning = true;

    // Attach scheduler to shutdown
    shutdownHooks.push(async () => {
      await scheduler.stop();
    });
  });
}

// ── Health Server ───────────────────────────────────────────────────

const health = createHealthServer(
  config.healthPort,
  {
    consumerPolling: () => consumer.polling,
    schedulerRunning: () => schedulerRunning,
  },
  logger.child("health")
);

health.start();

// ── Graceful Shutdown ───────────────────────────────────────────────
//
// On SIGTERM / SIGINT:
// 1. Stop accepting new cron ticks
// 2. Drain in-flight queue jobs (configurable timeout)
// 3. Close health server
// 4. Exit
//

const shutdownHooks: Array<() => Promise<void>> = [];

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down...`);

  // Run registered shutdown hooks (scheduler stop, etc.)
  for (const hook of shutdownHooks) {
    await hook();
  }

  // Drain queue consumer
  await consumer.stop(config.shutdownTimeout);

  // Close queue provider
  await memoryProvider.close();

  // Stop health server
  await health.stop();

  logger.info("Shutdown complete");
  process.exit(0);
}

// Force-exit after shutdown timeout + 5s buffer
function forceExit(signal: string): void {
  shutdown(signal).catch((err) => {
    logger.fatal("Shutdown error", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });

  setTimeout(() => {
    logger.fatal("Forced shutdown — deadline exceeded");
    process.exit(1);
  }, config.shutdownTimeout + 5000).unref();
}

process.on("SIGTERM", () => forceExit("SIGTERM"));
process.on("SIGINT", () => forceExit("SIGINT"));

// ── Inline Memory Provider ──────────────────────────────────────────
//
// Minimal in-memory queue for development. For production, replace
// with a real provider from the module-queue template.
//

function createMemoryProvider() {
  const jobs: Array<{
    job: import("./types.js").JobDefinition;
    acknowledged: boolean;
    failed: boolean;
  }> = [];
  let idCounter = 0;

  return {
    name: "memory",

    async init(): Promise<void> {},

    async enqueue(jobName: string, data: unknown): Promise<string> {
      const id = `mem-${++idCounter}`;
      jobs.push({
        job: {
          id,
          name: jobName,
          data,
          attempts: 0,
          maxRetries: 3,
          createdAt: new Date().toISOString(),
        },
        acknowledged: false,
        failed: false,
      });
      return id;
    },

    async dequeue(): Promise<import("./types.js").JobDefinition | null> {
      const entry = jobs.find((e) => !e.acknowledged && !e.failed);
      if (!entry) return null;
      entry.job.attempts += 1;
      return { ...entry.job };
    },

    async acknowledge(jobId: string): Promise<void> {
      const entry = jobs.find((e) => e.job.id === jobId);
      if (entry) entry.acknowledged = true;
    },

    async fail(jobId: string, _error: Error): Promise<void> {
      const entry = jobs.find((e) => e.job.id === jobId);
      if (!entry) return;
      if (entry.job.attempts < entry.job.maxRetries) {
        entry.job.attempts = entry.job.attempts;
      } else {
        entry.failed = true;
      }
    },

    async close(): Promise<void> {
      jobs.length = 0;
      idCounter = 0;
    },
  };
}
