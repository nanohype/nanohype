import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AuditAdapter } from "./types.js";
import type { AuditConfig, AuditEvent, QueryOptions } from "../types.js";
import { registerProvider } from "./registry.js";
import { eventIdOf } from "../event-id.js";

// ── DynamoDB Adapter ────────────────────────────────────────────────
//
// Single-table ledger. Each event is an item keyed PK = `CTX#<contextId>`,
// SK = `AUDIT#<timestamp>#<eventId>`, so a context's events sort by time within
// the partition. append uses ConditionExpression attribute_not_exists(SK) for
// idempotency and sets a TTL. queryByContext reads the partition newest-first;
// pass consistentRead when a read must see a just-written event (a read-gates-
// write check). config: { tableName, client?, ttlDays? }.
//

const SK_PREFIX = "AUDIT#";

class DynamoDBAuditAdapter implements AuditAdapter {
  readonly name = "dynamodb";
  private doc!: DynamoDBDocumentClient;
  private ownsClient = false;
  private tableName!: string;
  private ttlDays = 366;

  async init(config: AuditConfig): Promise<void> {
    if (!config.tableName) throw new Error("dynamodb audit adapter requires config.tableName");
    this.tableName = String(config.tableName);
    if (config.ttlDays !== undefined) this.ttlDays = Number(config.ttlDays);
    if (config.client) {
      this.doc = config.client as DynamoDBDocumentClient;
    } else {
      this.doc = DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: (config.region as string) ?? process.env.AWS_REGION }),
      );
      this.ownsClient = true;
    }
  }

  async append(event: AuditEvent): Promise<void> {
    const eventId = eventIdOf(event);
    const ttl = Math.floor(Date.now() / 1000) + this.ttlDays * 86_400;
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `CTX#${event.contextId}`,
            SK: `${SK_PREFIX}${event.timestamp}#${eventId}`,
            contextId: event.contextId,
            eventType: event.eventType,
            actor: event.actor,
            details: event.details,
            timestamp: event.timestamp,
            eventId,
            ttl,
          },
          ConditionExpression: "attribute_not_exists(SK)",
        }),
      );
    } catch (err) {
      // A duplicate (same SK) means the event is already recorded — idempotent.
      if ((err as { name?: string }).name === "ConditionalCheckFailedException") return;
      throw err;
    }
  }

  async queryByContext(contextId: string, opts?: QueryOptions): Promise<AuditEvent[]> {
    const values: Record<string, unknown> = {
      ":pk": `CTX#${contextId}`,
      ":pfx": SK_PREFIX,
    };
    let filter = "";
    const names: Record<string, string> = {};
    if (opts?.since) {
      values[":since"] = opts.since;
      names["#ts"] = "timestamp"; // `timestamp` is a DynamoDB reserved word
      filter = "#ts >= :since";
    }
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ...(filter ? { FilterExpression: filter, ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
        ConsistentRead: opts?.consistentRead ?? false,
        ScanIndexForward: false, // newest-first
        ...(opts?.limit !== undefined ? { Limit: opts.limit } : {}),
      }),
    );
    return (res.Items ?? []).map((it) => ({
      contextId: it.contextId as string,
      eventType: it.eventType as string,
      actor: it.actor as string,
      details: it.details as Record<string, unknown>,
      timestamp: it.timestamp as string,
      eventId: it.eventId as string,
    }));
  }

  async close(): Promise<void> {
    if (this.ownsClient) this.doc.destroy();
  }
}

registerProvider("dynamodb", () => new DynamoDBAuditAdapter());
