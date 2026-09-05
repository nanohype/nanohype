import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventIdOf } from "../event-id.js";
import { getProvider } from "../providers/index.js";
import type { AuditEvent } from "../types.js";

// Records what the adapter builds its own client with. Only the AWS SDK is
// faked — the adapter and the registry run as they ship. Without this the
// owned-client cases can assert nothing but that a promise resolves.
const clientOptions: Record<string, unknown>[] = [];
const destroy = vi.fn();

vi.mock("@aws-sdk/client-sqs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    SQSClient: class {
      constructor(options: Record<string, unknown>) {
        clientOptions.push(options);
      }
      destroy = destroy;
    },
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

/** Stands in for the SQS client the adapter takes as config.client. */
function fakeClient(reply: (input: CommandInput) => unknown = () => ({})) {
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

/** Fails the first send (the queue), succeeds on any later one (the DLQ). */
function failFirstSend(queueUrl: string, reason: string) {
  return (input: CommandInput) => {
    if (input.QueueUrl === queueUrl) throw new Error(reason);
    return {};
  };
}

describe("sqs adapter init", () => {
  beforeEach(() => {
    clientOptions.length = 0;
    destroy.mockClear();
  });

  it("requires a queue url", async () => {
    await expect(getProvider("sqs").init({})).rejects.toThrow(/queueUrl/);
  });

  it("opens its own client on the region the config names", async () => {
    const adapter = getProvider("sqs");
    await adapter.init({ queueUrl: "https://sqs/queue.fifo", region: "us-east-1" });

    expect(clientOptions).toEqual([{ region: "us-east-1" }]);
    await adapter.close();
    // It built the client, so it closes it.
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the ambient region when the config omits one", async () => {
    vi.stubEnv("AWS_REGION", "us-east-1");
    const adapter = getProvider("sqs");
    await adapter.init({ queueUrl: "https://sqs/queue.fifo" });

    expect(clientOptions).toEqual([{ region: "us-east-1" }]);
    await adapter.close();
    vi.unstubAllEnvs();
  });

  it("leaves an injected client to its owner", async () => {
    const client = fakeClient();
    const adapter = getProvider("sqs");
    await adapter.init({ queueUrl: "https://sqs/queue.fifo", client });
    await adapter.close();
    expect(client.destroy).not.toHaveBeenCalled();
  });
});

describe("sqs adapter append", () => {
  it("groups by context and dedups on the event id", async () => {
    const client = fakeClient();
    const counted: string[] = [];
    const adapter = getProvider("sqs");
    await adapter.init({
      queueUrl: "https://sqs/queue.fifo",
      client,
      onCounter: (metric: string) => counted.push(metric),
    });
    await adapter.append(event);

    expect(client.sent[0]).toMatchObject({
      QueueUrl: "https://sqs/queue.fifo",
      MessageGroupId: "incident-1",
      MessageDeduplicationId: eventIdOf(event),
    });
    expect(JSON.parse(client.sent[0].MessageBody as string)).toMatchObject({
      contextId: "incident-1",
      eventId: eventIdOf(event),
    });
    expect(counted).toEqual(["audit_sqs_ok"]);
  });

  it("propagates a send failure when no dead-letter queue is configured", async () => {
    const client = fakeClient(failFirstSend("https://sqs/queue.fifo", "queue unavailable"));
    const counted: string[] = [];
    const adapter = getProvider("sqs");
    await adapter.init({
      queueUrl: "https://sqs/queue.fifo",
      client,
      onCounter: (metric: string) => counted.push(metric),
    });

    await expect(adapter.append(event)).rejects.toThrow("queue unavailable");
    expect(counted).toEqual(["audit_sqs_error"]);
  });

  it("diverts to the dead-letter queue with the failure reason attached", async () => {
    const client = fakeClient(failFirstSend("https://sqs/queue.fifo", "queue unavailable"));
    const counted: string[] = [];
    const adapter = getProvider("sqs");
    await adapter.init({
      queueUrl: "https://sqs/queue.fifo",
      dlqUrl: "https://sqs/dlq.fifo",
      client,
      onCounter: (metric: string) => counted.push(metric),
    });

    // The caller sees a resolved append once the DLQ send succeeds: the event
    // reached the dead-letter queue, not the audit queue.
    await expect(adapter.append(event)).resolves.toBeUndefined();
    expect(client.sent[1]).toMatchObject({ QueueUrl: "https://sqs/dlq.fifo" });
    expect(JSON.parse(client.sent[1].MessageBody as string)).toMatchObject({
      eventId: eventIdOf(event),
      failureReason: expect.stringContaining("queue unavailable"),
    });
    expect(counted).toEqual(["audit_sqs_dlq"]);
  });

  it("propagates the dead-letter failure when both sends fail", async () => {
    const client = fakeClient(() => {
      throw new Error("region unreachable");
    });
    const counted: string[] = [];
    const adapter = getProvider("sqs");
    await adapter.init({
      queueUrl: "https://sqs/queue.fifo",
      dlqUrl: "https://sqs/dlq.fifo",
      client,
      onCounter: (metric: string) => counted.push(metric),
    });

    await expect(adapter.append(event)).rejects.toThrow("region unreachable");
    expect(counted).toEqual(["audit_sqs_total_loss"]);
  });

  it("counts nothing when the config supplies no counter", async () => {
    const client = fakeClient();
    const adapter = getProvider("sqs");
    await adapter.init({ queueUrl: "https://sqs/queue.fifo", client, onCounter: "not-callable" });
    await expect(adapter.append(event)).resolves.toBeUndefined();
  });
});

describe("sqs adapter queryByContext", () => {
  it("refuses to read: the queue is write-only from this side", async () => {
    const adapter = getProvider("sqs");
    await adapter.init({ queueUrl: "https://sqs/queue.fifo", client: fakeClient() });
    await expect(adapter.queryByContext("incident-1")).rejects.toThrow(/write-only/);
  });
});
