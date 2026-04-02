import { Queue, Worker, type ConnectionOptions, type Job as BullJob } from "bullmq";
import type { Job, JobOptions, QueueConfig } from "../types.js";
import type { QueueProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── BullMQ Provider ─────────────────────────────────────────────────
//
// Redis-backed queue using BullMQ. Supports delayed jobs, priorities,
// retries, and all BullMQ features. Requires a running Redis instance.
//
// Config:
//   connection: { host: string, port: number, password?: string }
//   queueName?: string  (defaults to "__PROJECT_NAME__")
//

let queue: Queue | null = null;
let connection: ConnectionOptions | null = null;
let queueName = "__PROJECT_NAME__";

/** Jobs dequeued but not yet acknowledged, keyed by job ID. */
const pending = new Map<string, BullJob>();

const bullmqProvider: QueueProvider = {
  name: "bullmq",

  async init(config: QueueConfig): Promise<void> {
    connection = (config.connection as ConnectionOptions) ?? {
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
    };
    queueName =
      (config.queueName as string) ?? process.env.QUEUE_NAME ?? "__PROJECT_NAME__";
    queue = new Queue(queueName, { connection });
    console.log(`[queue] BullMQ connected to queue "${queueName}"`);
  },

  async enqueue(
    jobName: string,
    data: unknown,
    opts?: JobOptions
  ): Promise<string> {
    if (!queue) throw new Error("BullMQ provider not initialized");

    const bullJob = await queue.add(jobName, data, {
      jobId: opts?.id,
      delay: opts?.delay ?? 0,
      priority: opts?.priority ?? 0,
      attempts: opts?.maxRetries ?? 3,
    });

    return bullJob.id ?? jobName;
  },

  async dequeue(): Promise<Job | null> {
    if (!queue) throw new Error("BullMQ provider not initialized");

    // Use getNextJob with a token to obtain the next waiting job
    const token = crypto.randomUUID();
    const worker = new Worker(queueName, undefined, {
      connection: connection!,
      autorun: false,
    });

    const bullJob = await worker.getNextJob(token);
    await worker.close();

    if (!bullJob) return null;

    pending.set(bullJob.id ?? "", bullJob);

    return {
      id: bullJob.id ?? "",
      name: bullJob.name,
      data: bullJob.data as unknown,
      attempts: bullJob.attemptsMade,
      maxRetries: (bullJob.opts.attempts ?? 3) - 1,
      delay: bullJob.opts.delay ?? 0,
      priority: bullJob.opts.priority ?? 0,
      createdAt: new Date(bullJob.timestamp).toISOString(),
    };
  },

  async acknowledge(jobId: string): Promise<void> {
    const bullJob = pending.get(jobId);
    if (bullJob) {
      await bullJob.moveToCompleted("done", bullJob.token ?? "", false);
      pending.delete(jobId);
    }
  },

  async fail(jobId: string, error: Error): Promise<void> {
    const bullJob = pending.get(jobId);
    if (bullJob) {
      await bullJob.moveToFailed(error, bullJob.token ?? "", false);
      pending.delete(jobId);
    }
  },

  async close(): Promise<void> {
    if (queue) {
      await queue.close();
      queue = null;
      console.log("[queue] BullMQ connection closed");
    }
    pending.clear();
  },
};

// Self-register
registerProvider(bullmqProvider);
