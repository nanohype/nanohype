import { queueJobDuration, queueJobTotal } from "./metrics.js";
import type { QueueProvider } from "./providers/types.js";
import type { HandlerMap, Job } from "./types.js";

// ── Worker Runner ───────────────────────────────────────────────────
//
// Polls or subscribes to the queue provider and dispatches jobs to
// registered handlers. Uses a simple poll loop with configurable
// interval and graceful shutdown via AbortController.
//

export interface WorkerOptions {
  /** Polling interval in milliseconds (default: 1000). */
  pollInterval?: number;

  /** Maximum concurrent jobs (default: 1). */
  concurrency?: number;

  /** AbortController signal for graceful shutdown. */
  signal?: AbortSignal;
}

const WORKER_DEFAULTS: Required<Omit<WorkerOptions, "signal">> = {
  pollInterval: 1000,
  concurrency: 1,
};

/**
 * Create and start a worker that processes jobs from the given provider.
 *
 * The worker polls for new jobs, matches them against the handler map
 * by job name, and calls acknowledge on success or fail on error.
 * Unrecognized job names are failed with an "unknown handler" error.
 *
 * Returns a stop function that halts the poll loop.
 */
export function createWorker(
  provider: QueueProvider,
  handlers: HandlerMap,
  opts?: WorkerOptions,
): { stop: () => Promise<void> } {
  const pollInterval = opts?.pollInterval ?? WORKER_DEFAULTS.pollInterval;
  const concurrency = opts?.concurrency ?? WORKER_DEFAULTS.concurrency;
  let running = true;
  let activeJobs = 0;

  const controller = new AbortController();

  // Honor external abort signal
  if (opts?.signal) {
    opts.signal.addEventListener("abort", () => {
      running = false;
      controller.abort();
    });
  }

  async function processJob(job: Job): Promise<void> {
    const handler = handlers[job.name];

    if (!handler) {
      console.error(`[worker] No handler registered for job "${job.name}"`);
      queueJobTotal.add(1, { job_name: job.name, status: "unhandled" });
      await provider.fail(job.id, new Error(`No handler registered for job "${job.name}"`));
      return;
    }

    const start = performance.now();

    try {
      await handler(job);
      await provider.acknowledge(job.id);

      const durationMs = performance.now() - start;
      queueJobTotal.add(1, { job_name: job.name, status: "success" });
      queueJobDuration.record(durationMs, { job_name: job.name });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[worker] Job "${job.name}" (${job.id}) failed: ${error.message}`);

      const durationMs = performance.now() - start;
      queueJobTotal.add(1, { job_name: job.name, status: "error" });
      queueJobDuration.record(durationMs, { job_name: job.name });

      await provider.fail(job.id, error);
    }
  }

  async function poll(): Promise<void> {
    while (running) {
      if (controller.signal.aborted) break;

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
        // Deliberately not awaited — dispatching without blocking is what makes
        // `concurrency` mean anything, and awaiting here would serialise the
        // worker to one job at a time. `processJob` reports handler failures
        // itself, so a rejection escaping it is the queue backend failing while
        // it does that. Logging it keeps a transient backend error from
        // reaching `unhandledRejection` and taking the process down.
        void processJob(job)
          .catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[worker] Job dispatch failed for "${job.name}": ${error.message}`);
          })
          .finally(() => {
            activeJobs--;
          });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[worker] Poll error: ${error.message}`);
        await sleep(pollInterval);
      }
    }
  }

  // Start the poll loop. Per-iteration errors are caught inside it; a rejection
  // escaping means the loop itself died, which has to be visible — a worker that
  // silently stopped consuming looks identical to an empty queue.
  void poll().catch((err) => {
    running = false;
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[worker] poll loop stopped: ${error.message}`);
  });

  return {
    async stop(): Promise<void> {
      running = false;
      controller.abort();

      // Wait for in-flight jobs to finish (30s deadline)
      const deadline = Date.now() + 30_000;
      while (activeJobs > 0 && Date.now() < deadline) {
        await sleep(100);
      }
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
