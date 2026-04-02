import type { Job, JobOptions } from "./types.js";

// ── Job Definition Helpers ──────────────────────────────────────────
//
// Utility functions for creating job payloads and applying defaults.
// These are provider-agnostic — they build the Job shape that all
// providers consume.
//

/** Default job options applied when not specified by the caller. */
const JOB_DEFAULTS: Required<JobOptions> = {
  maxRetries: 3,
  delay: 0,
  priority: 0,
  id: "",
};

/**
 * Merge caller-supplied options with defaults.
 */
export function resolveJobOptions(opts?: JobOptions): Required<JobOptions> {
  return {
    maxRetries: opts?.maxRetries ?? JOB_DEFAULTS.maxRetries,
    delay: opts?.delay ?? JOB_DEFAULTS.delay,
    priority: opts?.priority ?? JOB_DEFAULTS.priority,
    id: opts?.id ?? "",
  };
}

/**
 * Build a Job object from a name, data, and options. The provider is
 * responsible for assigning the final `id` and persisting the job; this
 * helper is useful for previewing / logging what will be enqueued.
 */
export function buildJob<T = unknown>(
  name: string,
  data: T,
  opts?: JobOptions
): Omit<Job<T>, "id"> & { id: string } {
  const resolved = resolveJobOptions(opts);

  return {
    id: resolved.id || `pending-${Date.now()}`,
    name,
    data,
    attempts: 0,
    maxRetries: resolved.maxRetries,
    delay: resolved.delay,
    priority: resolved.priority,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Type-safe job definition factory. Returns a named enqueue function
 * with the payload type baked in, which makes call sites cleaner:
 *
 *   const sendEmail = defineJob<EmailPayload>("send-email");
 *   await sendEmail(queue, { to: "a@b.com", subject: "hi" });
 */
export function defineJob<T = unknown>(jobName: string) {
  return async function enqueue(
    queueEnqueue: (
      name: string,
      data: unknown,
      opts?: JobOptions
    ) => Promise<string>,
    data: T,
    opts?: JobOptions
  ): Promise<string> {
    return queueEnqueue(jobName, data, opts);
  };
}
