// ── Worker Core Types ──────────────────────────────────────────────
//
// Shared interfaces for the worker service. WorkerConfig drives the
// top-level startWorker() function. JobDefinition and CronJobDefinition
// describe the units of work the consumer and scheduler operate on.
//

/** Configuration for the worker service. */
export interface WorkerConfig {
  /** Port for the health HTTP server (default: 9090). */
  healthPort: number;

  /** Queue provider name (e.g. "memory", "bullmq", "sqs"). */
  queueProvider: string;

  /** Polling interval in milliseconds for the queue consumer (default: 1000). */
  pollInterval: number;

  /** Maximum concurrent queue jobs (default: 5). */
  concurrency: number;

  /** Whether the cron scheduler is enabled (default: true). */
  cronEnabled: boolean;

  /** Graceful shutdown timeout in milliseconds (default: 30000). */
  shutdownTimeout: number;

  /** Log level. */
  logLevel: string;
}

/** A unit of work dequeued from the queue provider. */
export interface JobDefinition<T = unknown> {
  /** Unique identifier assigned by the provider. */
  id: string;

  /** Logical job name used to route to the correct handler. */
  name: string;

  /** Arbitrary payload carried by the job. */
  data: T;

  /** Number of times this job has been attempted so far. */
  attempts: number;

  /** Maximum number of retries before the job is marked as failed. */
  maxRetries: number;

  /** ISO-8601 timestamp of when the job was enqueued. */
  createdAt: string;
}

/** Definition for a cron-scheduled job. */
export interface CronJobDefinition {
  /** Unique name for this cron job. */
  name: string;

  /** Standard 5-field cron expression (minute hour dom month dow). */
  expression: string;

  /** The function to execute when the job fires. */
  handler: () => Promise<void>;

  /** Human-readable description for logging and introspection. */
  description?: string;
}
