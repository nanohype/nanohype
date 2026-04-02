import { Queue, Worker, type ConnectionOptions, type Job as BullJob } from "bullmq";
import type { Job, JobOptions, QueueConfig } from "../types.js";
import type { QueueProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── BullMQ Provider ─────────────────────────────────────────────────
//
// Redis-backed queue using BullMQ. Supports delayed jobs, priorities,
// retries, and all BullMQ features. Requires a running Redis instance.
//
// A single Worker is created during init() and continuously feeds jobs
// into a local buffer. dequeue() reads from that buffer — no new Redis
// connections are opened per call.
//
// Config:
//   connection: { host: string, port: number, password?: string }
//   queueName?: string  (defaults to "__PROJECT_NAME__")
//

let queue: Queue | null = null;
let worker: Worker | null = null;
let connection: ConnectionOptions | null = null;
let queueName = "__PROJECT_NAME__";

/** Local buffer of jobs received from the Worker processor callback. */
const buffer: Job[] = [];

/** BullMQ Job instances keyed by job ID, needed for acknowledge/fail. */
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

    // Single long-lived Worker — its processor callback feeds the local
    // buffer. We return a never-resolving promise from the processor so
    // BullMQ keeps the job "active" until we explicitly acknowledge or
    // fail it via the pending Map.
    worker = new Worker(
      queueName,
      async (bullJob: BullJob) => {
        const job: Job = {
          id: bullJob.id ?? "",
          name: bullJob.name,
          data: bullJob.data as unknown,
          attempts: bullJob.attemptsMade,
          maxRetries: (bullJob.opts.attempts ?? 3) - 1,
          delay: bullJob.opts.delay ?? 0,
          priority: bullJob.opts.priority ?? 0,
          createdAt: new Date(bullJob.timestamp).toISOString(),
        };

        pending.set(job.id, bullJob);
        buffer.push(job);

        // Block the processor until the job is acknowledged or failed.
        // This prevents BullMQ from auto-completing the job.
        return new Promise<void>((resolve, reject) => {
          const check = setInterval(() => {
            if (!pending.has(job.id)) {
              clearInterval(check);
              // If the job was moved to failed externally, reject so
              // BullMQ records the failure. Otherwise resolve normally.
              resolve();
            }
          }, 50);
        });
      },
      { connection, concurrency: 64 }
    );

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

    return buffer.shift() ?? null;
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
    if (worker) {
      await worker.close();
      worker = null;
    }
    if (queue) {
      await queue.close();
      queue = null;
    }
    buffer.length = 0;
    pending.clear();
    console.log("[queue] BullMQ connection closed");
  },
};

// Self-register
registerProvider(bullmqProvider);
