// ── Consumer Types ────────────────────────────────────────────────
//
// Interfaces for the queue consumer. QueueProvider is the pluggable
// seam that concrete providers implement. JobHandler processes a
// single dequeued job. HandlerMap routes job names to handlers.
//

import type { JobDefinition } from "../types.js";

/** Pluggable queue provider interface for enqueue/dequeue operations. */
export interface QueueProvider {
  /** Unique provider name (e.g. "memory", "bullmq", "sqs"). */
  readonly name: string;

  /** Initialize the provider with configuration. */
  init(config: Record<string, unknown>): Promise<void>;

  /** Enqueue a job for processing. Returns the assigned job ID. */
  enqueue(jobName: string, data: unknown): Promise<string>;

  /** Dequeue the next available job, or null if the queue is empty. */
  dequeue(): Promise<JobDefinition | null>;

  /** Acknowledge successful processing of a job. */
  acknowledge(jobId: string): Promise<void>;

  /** Mark a job as failed with the given error. */
  fail(jobId: string, error: Error): Promise<void>;

  /** Gracefully shut down the provider, releasing connections. */
  close(): Promise<void>;
}

/** Function that processes a single dequeued job. */
export type JobHandler<T = unknown> = (job: JobDefinition<T>) => Promise<void>;

/** Map of job names to their handler functions. */
export type HandlerMap = Record<string, JobHandler>;
