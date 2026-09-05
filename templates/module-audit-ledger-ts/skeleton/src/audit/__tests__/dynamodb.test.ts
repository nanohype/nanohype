import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventIdOf } from "../event-id.js";
import { getProvider } from "../providers/index.js";
import type { AuditEvent } from "../types.js";

// Records what the adapter builds its own client with. Only the AWS SDK is
// faked — the adapter, the registry and the id derivation all run as they
// ship. Without this the owned-client cases can assert nothing but that a
// promise resolves, and the region the adapter chose is unobservable.
const clientOptions: Record<string, unknown>[] = [];
const destroy = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor(options: Record<string, unknown>) {
      clientOptions.push(options);
    }
    destroy = destroy;
  },
}));

// `DynamoDBDocumentClient.from` wraps the client above, and the real wrapper
// inspects a config the fake does not carry. The commands stay real, so the
// shapes the adapter builds are still the shapes the SDK defines.
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    DynamoDBDocumentClient: { from: (client: unknown) => client },
  };
});

const event: AuditEvent = {
  contextId: "incident-1",
  eventType: "APPROVED",
  actor: "u-1",
  details: { draftId: "d-1" },
  timestamp: "2026-01-01T00:00:00.000Z",
};

type CommandInput = Record<string, unknown>;

/** Stands in for the document client the adapter takes as config.client. */
function fakeDoc(reply: (input: CommandInput) => unknown = () => ({})) {
  const sent: CommandInput[] = [];
  return {
    sent,
    send: vi.fn(async (cmd: { input: CommandInput }) => {
      sent.push(cmd.input);
      return reply(cmd.input);
    }),
    destroy: vi.fn(),
  };
}

describe("dynamodb adapter init", () => {
  beforeEach(() => {
    clientOptions.length = 0;
    destroy.mockClear();
  });

  it("requires a table name", async () => {
    await expect(getProvider("dynamodb").init({})).rejects.toThrow(/tableName/);
  });

  it("opens its own client on the region the config names", async () => {
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", region: "us-east-1" });

    expect(clientOptions).toEqual([{ region: "us-east-1" }]);
    await adapter.close();
    // It built the client, so it closes it.
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the ambient region when the config omits one", async () => {
    vi.stubEnv("AWS_REGION", "us-east-1");
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit" });

    expect(clientOptions).toEqual([{ region: "us-east-1" }]);
    await adapter.close();
    vi.unstubAllEnvs();
  });

  it("leaves an injected client to its owner", async () => {
    const doc = fakeDoc();
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc });
    await adapter.close();
    expect(doc.destroy).not.toHaveBeenCalled();
  });
});

describe("dynamodb adapter append", () => {
  it("keys the item so a context's events sort by time, conditioned on the id", async () => {
    const doc = fakeDoc();
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc });
    await adapter.append(event);

    expect(doc.sent[0]).toMatchObject({
      TableName: "audit",
      ConditionExpression: "attribute_not_exists(SK)",
      Item: {
        PK: "CTX#incident-1",
        SK: `AUDIT#2026-01-01T00:00:00.000Z#${eventIdOf(event)}`,
        contextId: "incident-1",
        eventType: "APPROVED",
        actor: "u-1",
        details: { draftId: "d-1" },
        eventId: eventIdOf(event),
      },
    });
  });

  it("sets a ttl from the configured retention window", async () => {
    const doc = fakeDoc();
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc, ttlDays: 1 });
    await adapter.append(event);

    const { ttl } = doc.sent[0].Item as { ttl: number };
    const now = Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(now);
    expect(ttl).toBeLessThanOrEqual(now + 86_400);
  });

  it("treats a failed condition as the event already being recorded", async () => {
    const doc = fakeDoc(() => {
      throw Object.assign(new Error("duplicate SK"), {
        name: "ConditionalCheckFailedException",
      });
    });
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc });
    await expect(adapter.append(event)).resolves.toBeUndefined();
  });

  it("propagates any other write failure", async () => {
    const doc = fakeDoc(() => {
      throw new Error("throughput exceeded");
    });
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc });
    await expect(adapter.append(event)).rejects.toThrow("throughput exceeded");
  });
});

describe("dynamodb adapter queryByContext", () => {
  it("reads the partition newest-first with an eventually-consistent read", async () => {
    const doc = fakeDoc(() => ({
      Items: [
        {
          contextId: "incident-1",
          eventType: "APPROVED",
          actor: "u-1",
          details: { draftId: "d-1" },
          timestamp: "2026-01-01T00:00:00.000Z",
          eventId: "e-1",
        },
      ],
    }));
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc });
    const events = await adapter.queryByContext("incident-1");

    expect(doc.sent[0]).toMatchObject({
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
      ExpressionAttributeValues: { ":pk": "CTX#incident-1", ":pfx": "AUDIT#" },
      ConsistentRead: false,
      ScanIndexForward: false,
    });
    expect(doc.sent[0].FilterExpression).toBeUndefined();
    expect(doc.sent[0].Limit).toBeUndefined();
    expect(events).toEqual([
      {
        contextId: "incident-1",
        eventType: "APPROVED",
        actor: "u-1",
        details: { draftId: "d-1" },
        timestamp: "2026-01-01T00:00:00.000Z",
        eventId: "e-1",
      },
    ]);
  });

  it("filters on the aliased timestamp attribute and caps the page", async () => {
    const doc = fakeDoc(() => ({ Items: [] }));
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc });
    await adapter.queryByContext("incident-1", {
      since: "2026-01-01T00:00:00.000Z",
      consistentRead: true,
      limit: 5,
    });

    expect(doc.sent[0]).toMatchObject({
      FilterExpression: "#ts >= :since",
      ExpressionAttributeNames: { "#ts": "timestamp" },
      ExpressionAttributeValues: { ":since": "2026-01-01T00:00:00.000Z" },
      ConsistentRead: true,
      Limit: 5,
    });
  });

  it("returns an empty trail when the partition holds no items", async () => {
    const doc = fakeDoc(() => ({}));
    const adapter = getProvider("dynamodb");
    await adapter.init({ tableName: "audit", client: doc });
    expect(await adapter.queryByContext("incident-1")).toEqual([]);
  });
});
