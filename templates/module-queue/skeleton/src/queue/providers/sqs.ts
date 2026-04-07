import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import type { Job, JobOptions, QueueConfig } from "../types.js";
import type { QueueProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── AWS SQS Provider ────────────────────────────────────────────────
//
// Polls an SQS queue with long polling. Handles visibility timeout
// for in-flight messages. Uses the AWS SDK v3 modular client.
//
// Config:
//   queueUrl: string          (required — full SQS queue URL)
//   region?: string           (defaults to AWS_REGION or us-east-1)
//   waitTimeSeconds?: number  (long-poll duration, default 20)
//   visibilityTimeout?: number (seconds, default 30)
//

let client: SQSClient | null = null;
let queueUrl = "";
let waitTimeSeconds = 20;
let visibilityTimeout = 30;

/** Receipt handles for in-flight messages, keyed by job ID. */
const receiptHandles = new Map<string, string>();

const sqsProvider: QueueProvider = {
  name: "sqs",

  async init(config: QueueConfig): Promise<void> {
    const region =
      (config.region as string) ?? process.env.AWS_REGION ?? "us-east-1";
    queueUrl =
      (config.queueUrl as string) ?? process.env.SQS_QUEUE_URL ?? "";
    waitTimeSeconds = (config.waitTimeSeconds as number) ?? 20;
    visibilityTimeout = (config.visibilityTimeout as number) ?? 30;

    if (!queueUrl) {
      throw new Error(
        "SQS provider requires a queueUrl in config or SQS_QUEUE_URL env var"
      );
    }

    client = new SQSClient({ region });
    console.log(`[queue] SQS provider initialized for ${queueUrl}`);
  },

  async enqueue(
    jobName: string,
    data: unknown,
    opts?: JobOptions
  ): Promise<string> {
    if (!client) throw new Error("SQS provider not initialized");

    const id = opts?.id ?? crypto.randomUUID();

    const body = JSON.stringify({
      id,
      name: jobName,
      data,
      maxRetries: opts?.maxRetries ?? 3,
      priority: opts?.priority ?? 0,
      createdAt: new Date().toISOString(),
    });

    await client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        DelaySeconds: opts?.delay ? Math.min(Math.floor(opts.delay / 1000), 900) : 0,
        MessageGroupId: jobName,
        MessageDeduplicationId: id,
      })
    );

    return id;
  },

  async dequeue(): Promise<Job | null> {
    if (!client) throw new Error("SQS provider not initialized");

    const response = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: waitTimeSeconds,
        VisibilityTimeout: visibilityTimeout,
        MessageAttributeNames: ["All"],
      })
    );

    const messages: Message[] = response.Messages ?? [];
    if (messages.length === 0) return null;

    const msg = messages[0]!;
    const parsed = JSON.parse(msg.Body ?? "{}") as {
      id: string;
      name: string;
      data: unknown;
      maxRetries: number;
      priority: number;
      createdAt: string;
    };

    // Track receipt handle for acknowledge/fail
    receiptHandles.set(parsed.id, msg.ReceiptHandle ?? "");

    return {
      id: parsed.id,
      name: parsed.name,
      data: parsed.data,
      attempts: Number(msg.Attributes?.ApproximateReceiveCount ?? "1"),
      maxRetries: parsed.maxRetries,
      delay: 0,
      priority: parsed.priority,
      createdAt: parsed.createdAt,
    };
  },

  async acknowledge(jobId: string): Promise<void> {
    if (!client) throw new Error("SQS provider not initialized");

    const receiptHandle = receiptHandles.get(jobId);
    if (!receiptHandle) return;

    await client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      })
    );

    receiptHandles.delete(jobId);
  },

  async fail(jobId: string, _error: Error): Promise<void> {
    if (!client) throw new Error("SQS provider not initialized");

    const receiptHandle = receiptHandles.get(jobId);
    if (!receiptHandle) return;

    // Make the message immediately visible again for retry
    await client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 0,
      })
    );

    receiptHandles.delete(jobId);
  },

  async close(): Promise<void> {
    if (client) {
      client.destroy();
      client = null;
      console.log("[queue] SQS provider closed");
    }
    receiptHandles.clear();
  },
};

// Self-register
registerProvider("sqs", () => sqsProvider);
