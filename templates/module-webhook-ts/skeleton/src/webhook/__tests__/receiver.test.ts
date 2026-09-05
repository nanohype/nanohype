import { describe, expect, it, vi } from "vitest";
import { InMemoryEventLog } from "../event-log.js";
import { createWebhookReceiver } from "../receiver.js";
// Import signature providers to trigger self-registration
import "../signatures/index.js";
import type { WebhookEventLog } from "../event-log.js";
import { getSignatureProvider } from "../signatures/registry.js";

// ── Receiver ───────────────────────────────────────────────────────
//
// The receiver is the trust boundary: everything past `handleRequest`
// runs on a body an unauthenticated caller supplied. Each rejection is
// checked on the return value and on what reached the event log, since a
// handler that runs on an unverified body and a handler that runs on a
// verified one are indistinguishable from the result alone.
//
// The event log is optional, so every `record` call sits behind an
// optional chain — each outcome is exercised both with a log attached and
// without one.

const secret = "test-secret";
const signatureMethod = "hmac-sha256";

const sign = (rawBody: string) => getSignatureProvider(signatureMethod).sign(rawBody, secret);

function makeReceiver(eventLog?: WebhookEventLog) {
  return createWebhookReceiver({ secret, signatureMethod, eventLog });
}

describe("receiver config", () => {
  it("rejects a config with an empty secret", () => {
    expect(() => createWebhookReceiver({ secret: "" })).toThrow(
      /secret must be a non-empty string/,
    );
  });

  it("reads the default signature header when the config names none", () => {
    // The defaults are applied at construction, so a receiver built from
    // secret alone still looks for a signature and still refuses without one.
    const receiver = createWebhookReceiver({ secret });

    return expect(receiver.handleRequest("{}", {})).resolves.toEqual({
      verified: false,
      error: "Missing signature header",
    });
  });

  it("reads the signature from the configured header name", async () => {
    const receiver = createWebhookReceiver({
      secret,
      signatureMethod,
      signatureHeader: "x-hub-signature",
    });
    const rawBody = JSON.stringify({ event: "push", payload: {} });

    const result = await receiver.handleRequest(rawBody, { "x-hub-signature": sign(rawBody) });

    expect(result.verified).toBe(true);
  });
});

describe("receiver signature verification", () => {
  it("refuses a request with no signature header", async () => {
    const eventLog = new InMemoryEventLog();
    const receiver = makeReceiver(eventLog);

    const result = await receiver.handleRequest(JSON.stringify({ event: "push" }), {});

    expect(result).toEqual({ verified: false, error: "Missing signature header" });
    expect(eventLog.list()).toEqual([
      expect.objectContaining({
        direction: "received",
        status: "failed",
        attempts: 1,
        error: "Missing signature header",
      }),
    ]);
  });

  it("refuses a signature that does not match the body", async () => {
    const eventLog = new InMemoryEventLog();
    const receiver = makeReceiver(eventLog);
    const rawBody = JSON.stringify({ event: "push", payload: {} });

    const result = await receiver.handleRequest(rawBody, {
      "x-signature": sign(`${rawBody} `),
    });

    expect(result).toEqual({ verified: false, error: "Invalid signature" });
    expect(eventLog.list()).toEqual([
      expect.objectContaining({ status: "failed", error: "Invalid signature" }),
    ]);
  });

  it("refuses a signature of the wrong length without throwing", async () => {
    // `timingSafeEqual` throws on unequal lengths, so a truncated signature
    // has to come back as a refusal rather than as a crash in the handler.
    const receiver = makeReceiver();

    const result = await receiver.handleRequest("{}", { "x-signature": "short" });

    expect(result).toEqual({ verified: false, error: "Invalid signature" });
  });

  it("does not dispatch to a handler when verification fails", async () => {
    const receiver = makeReceiver();
    const handler = vi.fn();
    receiver.on("push", handler);

    await receiver.handleRequest(JSON.stringify({ event: "push" }), { "x-signature": "deadbeef" });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("receiver body parsing", () => {
  it("reports a signed body that is not JSON as verified but unparsable", async () => {
    const eventLog = new InMemoryEventLog();
    const receiver = makeReceiver(eventLog);
    const rawBody = "not-json";

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(result).toEqual({ verified: true, error: "Invalid JSON body" });
    expect(eventLog.list()).toEqual([
      expect.objectContaining({ status: "failed", error: "Invalid JSON body" }),
    ]);
  });

  it("returns the parse failure without an event when no log is attached", async () => {
    const receiver = makeReceiver();
    const rawBody = "{";

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(result).toEqual({ verified: true, error: "Invalid JSON body" });
  });
});

describe("receiver event construction", () => {
  it("takes the event type from the body", async () => {
    const receiver = makeReceiver();
    const rawBody = JSON.stringify({ id: "evt-1", event: "push", payload: { ref: "main" } });

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(result.event).toMatchObject({
      id: "evt-1",
      event: "push",
      payload: { ref: "main" },
    });
    expect(result.event?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falls back to the event header when the body carries no event type", async () => {
    const receiver = makeReceiver();
    const rawBody = JSON.stringify({ payload: { ref: "main" } });

    const result = await receiver.handleRequest(rawBody, {
      "x-signature": sign(rawBody),
      "x-event": "deploy.completed",
    });

    expect(result.event?.event).toBe("deploy.completed");
  });

  it("reads the event type from the configured event header name", async () => {
    const receiver = createWebhookReceiver({
      secret,
      signatureMethod,
      eventHeader: "x-github-event",
    });
    const rawBody = JSON.stringify({ payload: {} });

    const result = await receiver.handleRequest(rawBody, {
      "x-signature": sign(rawBody),
      "x-github-event": "pull_request",
    });

    expect(result.event?.event).toBe("pull_request");
  });

  it("labels the event unknown when neither body nor header names a type", async () => {
    const receiver = makeReceiver();
    const rawBody = JSON.stringify({ payload: {} });

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(result.event?.event).toBe("unknown");
  });

  it("generates an id when the body carries none", async () => {
    const receiver = makeReceiver();
    const rawBody = JSON.stringify({ event: "push", payload: {} });

    const first = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });
    const second = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(first.event?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.event?.id).not.toBe(second.event?.id);
  });

  it("carries the whole body as the payload when there is no payload field", async () => {
    const receiver = makeReceiver();
    const rawBody = JSON.stringify({ event: "push", ref: "main" });

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(result.event?.payload).toEqual({ event: "push", ref: "main" });
  });
});

describe("receiver dispatch", () => {
  it("dispatches a verified event to the handler registered for its type", async () => {
    const eventLog = new InMemoryEventLog();
    const receiver = makeReceiver(eventLog);
    const handler = vi.fn().mockResolvedValue(undefined);
    receiver.on("push", handler);
    const rawBody = JSON.stringify({ id: "evt-2", event: "push", payload: { ref: "main" } });

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0]).toMatchObject({ id: "evt-2", event: "push" });
    expect(result).toEqual({ verified: true, event: result.event });
    expect(eventLog.get("evt-2")).toMatchObject({
      direction: "received",
      status: "success",
      attempts: 1,
    });
  });

  it("does not dispatch to a handler registered for another type", async () => {
    const receiver = makeReceiver();
    const handler = vi.fn().mockResolvedValue(undefined);
    receiver.on("push", handler);
    const rawBody = JSON.stringify({ event: "deploy.completed", payload: {} });

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(handler).not.toHaveBeenCalled();
    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("replaces the handler when a type is registered twice", async () => {
    const receiver = makeReceiver();
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    receiver.on("push", first);
    receiver.on("push", second);
    const rawBody = JSON.stringify({ event: "push", payload: {} });

    await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("reports a handler that rejects with an Error, and logs the failure", async () => {
    const eventLog = new InMemoryEventLog();
    const receiver = makeReceiver(eventLog);
    receiver.on("push", async () => {
      throw new Error("handler exploded");
    });
    const rawBody = JSON.stringify({ id: "evt-3", event: "push", payload: {} });

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(result).toEqual({
      verified: true,
      event: expect.objectContaining({ id: "evt-3" }),
      error: "handler exploded",
    });
    expect(eventLog.get("evt-3")).toMatchObject({ status: "failed", error: "handler exploded" });
  });

  it("reports a handler that rejects with a non-Error value", async () => {
    const receiver = makeReceiver();
    receiver.on("push", async () => {
      throw "plain string rejection";
    });
    const rawBody = JSON.stringify({ event: "push", payload: {} });

    const result = await receiver.handleRequest(rawBody, { "x-signature": sign(rawBody) });

    expect(result.verified).toBe(true);
    expect(result.error).toBe("plain string rejection");
  });
});
