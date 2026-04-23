// ── Queue Core Types ────────────────────────────────────────────────
//
// Shared interfaces for jobs, job options, worker handlers, and the
// top-level queue facade. These are provider-agnostic — every broker
// implementation works against the same shapes.
//

/** Unique job identifier. */
export type JobId = string;

/** Priority levels for job scheduling. Lower number = higher priority. */
export type JobPriority = number;

/** A unit of work to be processed by a worker. */
export interface Job<T = unknown> {
  /** Unique identifier assigned by the provider. */
  id: JobId;

  /** Logical job name used to route to the correct handler. */
  name: string;

  /** Arbitrary payload carried by the job. */
  data: T;

  /** Number of times this job has been attempted so far. */
  attempts: number;

  /** Maximum number of retries before the job is marked as failed. */
  maxRetries: number;

  /** Delay in milliseconds before the job becomes eligible for processing. */
  delay: number;

  /** Priority value. Lower numbers are processed first. */
  priority: JobPriority;

  /** ISO-8601 timestamp of when the job was enqueued. */
  createdAt: string;
}

/** Options when enqueuing a new job. */
export interface JobOptions {
  /** Maximum retry attempts (default: 3). */
  maxRetries?: number;

  /** Delay in milliseconds before the job becomes eligible (default: 0). */
  delay?: number;

  /** Priority value — lower is higher priority (default: 0). */
  priority?: number;

  /** Caller-supplied job ID. Provider generates one if omitted. */
  id?: string;
}

/** Function that processes a single job. */
export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

/** Map of job names to their handler functions. */
export type HandlerMap = Record<string, JobHandler>;

/** Configuration passed to createQueue. */
export interface QueueConfig {
  /** Provider-specific connection or configuration options. */
  [key: string]: unknown;
}
