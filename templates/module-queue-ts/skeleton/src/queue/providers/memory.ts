import type { Job, JobOptions, QueueConfig } from "../types.js";
import type { QueueProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── In-Memory Queue Provider ────────────────────────────────────────
//
// A simple array-backed queue suitable for development and testing.
// Jobs are stored in memory and lost on process exit. Dequeue returns
// the highest-priority eligible job (delay-aware). No external
// dependencies required.
//

interface StoredJob {
  job: Job;
  eligibleAt: number;
  // Flipped on dequeue so the next dequeue doesn't return the same job.
  // Cleared by fail() when the job gets retried. Acknowledge/failed are
  // terminal states that also keep the entry out of future dequeues.
  dequeued: boolean;
  acknowledged: boolean;
  failed: boolean;
}

const jobs: StoredJob[] = [];
let idCounter = 0;

const memoryProvider: QueueProvider = {
  name: "memory",

  async init(_config: QueueConfig): Promise<void> {
    // No setup needed for in-memory provider
  },

  async enqueue(
    jobName: string,
    data: unknown,
    opts?: JobOptions
  ): Promise<string> {
    const id = opts?.id ?? `mem-${++idCounter}`;
    const delay = opts?.delay ?? 0;
    const priority = opts?.priority ?? 0;
    const maxRetries = opts?.maxRetries ?? 3;

    const job: Job = {
      id,
      name: jobName,
      data,
      attempts: 0,
      maxRetries,
      delay,
      priority,
      createdAt: new Date().toISOString(),
    };

    jobs.push({
      job,
      eligibleAt: Date.now() + delay,
      dequeued: false,
      acknowledged: false,
      failed: false,
    });

    // Sort by priority (lower = higher priority), then by creation time
    jobs.sort((a, b) => a.job.priority - b.job.priority);

    return id;
  },

  async dequeue(): Promise<Job | null> {
    const now = Date.now();

    const index = jobs.findIndex(
      (entry) =>
        !entry.dequeued &&
        !entry.acknowledged &&
        !entry.failed &&
        entry.eligibleAt <= now
    );

    if (index === -1) return null;

    const entry = jobs[index]!;
    entry.job.attempts += 1;
    entry.dequeued = true;
    return { ...entry.job };
  },

  async acknowledge(jobId: string): Promise<void> {
    const entry = jobs.find((e) => e.job.id === jobId);
    if (entry) {
      entry.acknowledged = true;
    }
  },

  async fail(jobId: string, _error: Error): Promise<void> {
    const entry = jobs.find((e) => e.job.id === jobId);
    if (!entry) return;

    if (entry.job.attempts < entry.job.maxRetries) {
      // Re-enqueue for retry — mark as eligible + visible again.
      entry.eligibleAt = Date.now();
      entry.dequeued = false;
    } else {
      entry.failed = true;
    }
  },

  async close(): Promise<void> {
    jobs.length = 0;
    idCounter = 0;
  },
};

// Self-register
registerProvider("memory", () => memoryProvider);
