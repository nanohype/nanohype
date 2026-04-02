// ── Queue Provider Interface ────────────────────────────────────────
//
// All queue providers implement this interface. The registry pattern
// allows new providers to be added by importing a provider module
// that calls registerProvider() at the module level.
//

import type { Job, JobOptions, QueueConfig } from "../types.js";

export interface QueueProvider {
  /** Unique provider name (e.g. "memory", "bullmq", "sqs"). */
  readonly name: string;

  /** Initialize the provider with configuration. */
  init(config: QueueConfig): Promise<void>;

  /** Enqueue a job for processing. Returns the assigned job ID. */
  enqueue(jobName: string, data: unknown, opts?: JobOptions): Promise<string>;

  /** Dequeue the next available job, or null if the queue is empty. */
  dequeue(): Promise<Job | null>;

  /** Acknowledge successful processing of a job. */
  acknowledge(jobId: string): Promise<void>;

  /** Mark a job as failed with the given error. */
  fail(jobId: string, error: Error): Promise<void>;

  /** Gracefully shut down the provider, releasing connections. */
  close(): Promise<void>;
}
