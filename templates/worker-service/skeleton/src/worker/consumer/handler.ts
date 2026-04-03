import type { JobDefinition } from "../types.js";
import type { Logger } from "../logger.js";
import type { QueueProvider, HandlerMap } from "./types.js";
import { workerJobTotal, workerJobDuration } from "../metrics.js";

// ── Queue Consumer ────────────────────────────────────────────────
//
// Polls the queue provider's dequeue(), dispatches to registered
// handlers by job name, and acknowledges on success or fails on
// error. Uses a simple poll loop with configurable interval and
// concurrency. Graceful shutdown via stop() drains in-flight jobs.
//

export interface ConsumerOptions {
  /** Polling interval in milliseconds (default: 1000). */
  pollInterval?: number;

  /** Maximum concurrent jobs (default: 5). */
  concurrency?: number;
}

const CONSUMER_DEFAULTS: Required<ConsumerOptions> = {
  pollInterval: 1000,
  concurrency: 5,
};

export interface QueueConsumer {
  /** Start polling for jobs. */
  start(): void;

  /** Stop polling and wait for in-flight jobs to drain. */
  stop(timeoutMs?: number): Promise<void>;

  /** Whether the consumer is currently polling. */
  readonly polling: boolean;
}

/**
 * Create a queue consumer that polls the provider and dispatches
 * jobs to registered handlers. Unrecognized job names are failed
 * with an "unknown handler" error.
 */
export function createQueueConsumer(
  provider: QueueProvider,
  handlers: HandlerMap,
  logger: Logger,
  opts?: ConsumerOptions
): QueueConsumer {
  const pollInterval = opts?.pollInterval ?? CONSUMER_DEFAULTS.pollInterval;
  const concurrency = opts?.concurrency ?? CONSUMER_DEFAULTS.concurrency;

  let running = false;
  let activeJobs = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  async function processJob(job: JobDefinition): Promise<void> {
    const handler = handlers[job.name];

    if (!handler) {
      logger.error(`No handler registered for job "${job.name}"`, { jobId: job.id });
      workerJobTotal.add(1, { job_name: job.name, status: "unhandled" });
      await provider.fail(
        job.id,
        new Error(`No handler registered for job "${job.name}"`)
      );
      return;
    }

    const start = performance.now();

    try {
      await handler(job);
      await provider.acknowledge(job.id);

      const durationMs = performance.now() - start;
      workerJobTotal.add(1, { job_name: job.name, status: "success" });
      workerJobDuration.record(durationMs, { job_name: job.name });

      logger.debug(`Job completed: ${job.name}`, {
        jobId: job.id,
        durationMs: Math.round(durationMs),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const durationMs = performance.now() - start;

      workerJobTotal.add(1, { job_name: job.name, status: "error" });
      workerJobDuration.record(durationMs, { job_name: job.name });

      logger.error(`Job failed: ${job.name}`, {
        jobId: job.id,
        error: error.message,
        attempts: job.attempts,
        maxRetries: job.maxRetries,
      });

      await provider.fail(job.id, error);
    }
  }

  async function poll(): Promise<void> {
    while (running) {
      if (activeJobs >= concurrency) {
        await sleep(pollInterval);
        continue;
      }

      try {
        const job = await provider.dequeue();

        if (!job) {
          await sleep(pollInterval);
          continue;
        }

        activeJobs++;
        processJob(job).finally(() => {
          activeJobs--;
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`Poll error: ${error.message}`);
        await sleep(pollInterval);
      }
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    logger.info("Queue consumer started", {
      provider: provider.name,
      pollInterval,
      concurrency,
    });
    poll();
  }

  async function stop(timeoutMs = 30_000): Promise<void> {
    running = false;

    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }

    // Wait for in-flight jobs to finish
    const deadline = Date.now() + timeoutMs;
    while (activeJobs > 0 && Date.now() < deadline) {
      await sleep(100);
    }

    if (activeJobs > 0) {
      logger.warn(`Consumer stopped with ${activeJobs} in-flight job(s)`);
    } else {
      logger.info("Queue consumer stopped");
    }
  }

  return {
    start,
    stop,
    get polling() {
      return running;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
