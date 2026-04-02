// ── Module Queue — Main Exports ──────────────────────────────────────
//
// Public API for the queue module. Import providers so they
// self-register, then expose createQueue and createWorker as the
// primary entry points.
//

import { getProvider, listProviders } from "./providers/index.js";
import type { QueueProvider } from "./providers/types.js";
import type { QueueConfig, HandlerMap } from "./types.js";
import { createWorker, type WorkerOptions } from "./worker.js";

// Re-export everything consumers need
export { createWorker } from "./worker.js";
export { defineJob, buildJob, resolveJobOptions } from "./job.js";
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { QueueProvider } from "./providers/types.js";
export type { WorkerOptions } from "./worker.js";
export type {
  Job,
  JobId,
  JobOptions,
  JobHandler,
  JobPriority,
  HandlerMap,
  QueueConfig,
} from "./types.js";

// ── Queue Facade ────────────────────────────────────────────────────

export interface Queue {
  /** The underlying provider instance. */
  provider: QueueProvider;

  /** Enqueue a job for background processing. */
  enqueue(jobName: string, data: unknown, opts?: import("./types.js").JobOptions): Promise<string>;

  /** Start a worker that processes jobs using the given handlers. */
  startWorker(handlers: HandlerMap, opts?: WorkerOptions): { stop: () => void };

  /** Shut down the queue and release resources. */
  close(): Promise<void>;
}

/**
 * Create a configured queue instance backed by the named provider.
 *
 * The provider must already be registered (built-in providers
 * self-register on import via the providers barrel).
 *
 *   const queue = await createQueue("memory");
 *   await queue.enqueue("send-email", { to: "a@b.com" });
 *   queue.startWorker({ "send-email": async (job) => { ... } });
 */
export async function createQueue(
  providerName: string = "__QUEUE_PROVIDER__",
  config: QueueConfig = {}
): Promise<Queue> {
  const provider = getProvider(providerName);
  await provider.init(config);

  return {
    provider,

    enqueue(jobName, data, opts) {
      return provider.enqueue(jobName, data, opts);
    },

    startWorker(handlers, opts) {
      return createWorker(provider, handlers, opts);
    },

    async close() {
      await provider.close();
    },
  };
}
