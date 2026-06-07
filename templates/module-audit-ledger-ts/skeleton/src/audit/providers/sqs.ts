import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { AuditAdapter } from "./types.js";
import type { AuditConfig, AuditEvent, QueryOptions } from "../types.js";
import { registerProvider } from "./registry.js";
import { eventIdOf } from "../event-id.js";

// ── SQS Adapter ─────────────────────────────────────────────────────
//
// At-least-once delivery to a FIFO queue, drained by a separate consumer to a
// durable, queryable store (DynamoDB + S3). append sends with MessageGroupId =
// contextId (per-context ordering) and MessageDeduplicationId = the event id
// (dedup). On a send failure it falls back to a DLQ so an event is never
// silently dropped; if the DLQ also fails it throws. Because the queue is
// write-only from this side, queryByContext is unsupported — query the drained
// store instead. config: { queueUrl, dlqUrl?, client?, onCounter? }.
//

type Counter = (metric: string) => void;

class SQSAuditAdapter implements AuditAdapter {
  readonly name = "sqs";
  private client!: SQSClient;
  private ownsClient = false;
  private queueUrl!: string;
  private dlqUrl?: string;
  private onCounter: Counter = () => {};

  async init(config: AuditConfig): Promise<void> {
    if (!config.queueUrl) throw new Error("sqs audit adapter requires config.queueUrl");
    this.queueUrl = String(config.queueUrl);
    if (config.dlqUrl) this.dlqUrl = String(config.dlqUrl);
    if (typeof config.onCounter === "function") this.onCounter = config.onCounter as Counter;
    if (config.client) {
      this.client = config.client as SQSClient;
    } else {
      this.client = new SQSClient({ region: (config.region as string) ?? process.env.AWS_REGION });
      this.ownsClient = true;
    }
  }

  async append(event: AuditEvent): Promise<void> {
    const eventId = eventIdOf(event);
    const body = JSON.stringify({ ...event, eventId });
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: body,
          MessageGroupId: event.contextId,
          MessageDeduplicationId: eventId,
        }),
      );
      this.onCounter("audit_sqs_ok");
    } catch (err) {
      if (!this.dlqUrl) {
        this.onCounter("audit_sqs_error");
        throw err;
      }
      try {
        await this.client.send(
          new SendMessageCommand({
            QueueUrl: this.dlqUrl,
            MessageBody: JSON.stringify({ ...event, eventId, failureReason: String(err) }),
            MessageGroupId: event.contextId,
            MessageDeduplicationId: eventId,
          }),
        );
        this.onCounter("audit_sqs_dlq");
      } catch (dlqErr) {
        this.onCounter("audit_sqs_total_loss");
        throw dlqErr;
      }
    }
  }

  async queryByContext(_contextId: string, _opts?: QueryOptions): Promise<AuditEvent[]> {
    throw new Error(
      "sqs audit adapter is write-only — query the store the consumer drains to (DynamoDB/S3), not the queue",
    );
  }

  async close(): Promise<void> {
    if (this.ownsClient) this.client.destroy();
  }
}

registerProvider("sqs", () => new SQSAuditAdapter());
