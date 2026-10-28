import { describe, expect, it, vi } from "vitest";
import type { PaymentProvider } from "../providers/types.js";
import type { BillingWebhookEvent } from "../types.js";
import { createBillingWebhookRouter } from "../webhooks/handler.js";

// ── Billing Webhook Router ─────────────────────────────────────────
//
// The router verifies with the provider instance it is given and nothing
// else, so each test hands it a provider whose `handleWebhook` is the
// verification outcome under test. What is asserted is the gate: a request
// that fails verification reaches no handler, and a verified event reaches
// exactly the handler registered for its type.
//

function event(overrides: Partial<BillingWebhookEvent> = {}): BillingWebhookEvent {
  return {
    id: "evt_1",
    type: "invoice.paid",
    payload: { id: "in_1" },
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A provider whose verification is `verify`; every other method is unused here. */
function verifyingProvider(verify: PaymentProvider["handleWebhook"]): PaymentProvider {
  const unused = () => Promise.reject(new Error("not used by the webhook router"));
  return {
    name: "fake",
    init: unused,
    createCustomer: unused,
    createSubscription: unused,
    chargeInvoice: unused,
    handleWebhook: vi.fn(verify),
    listInvoices: unused,
    close: unused,
  };
}

describe("billing webhook router", () => {
  it("verifies with the provider it was built with, passing the raw body and signature", async () => {
    const provider = verifyingProvider(async () => event());
    const router = createBillingWebhookRouter(provider);

    await router.handleBillingWebhook('{"raw": true}\n', "t=1,v1=abc");

    expect(provider.handleWebhook).toHaveBeenCalledExactlyOnceWith('{"raw": true}\n', "t=1,v1=abc");
  });

  it("dispatches a verified event to the handler registered for its type", async () => {
    const verified = event({ id: "evt_paid", type: "invoice.paid" });
    const router = createBillingWebhookRouter(verifyingProvider(async () => verified));
    const seen: BillingWebhookEvent[] = [];
    router.on("invoice.paid", async (e) => {
      seen.push(e);
    });

    const result = await router.handleBillingWebhook("{}", "sig");

    expect(result).toEqual({ ok: true, event: verified });
    expect(seen).toEqual([verified]);
  });

  it("acknowledges a verified event no handler is registered for", async () => {
    const verified = event({ type: "customer.subscription.created" });
    const router = createBillingWebhookRouter(verifyingProvider(async () => verified));
    const other = vi.fn(async () => {});
    router.on("invoice.paid", other);

    const result = await router.handleBillingWebhook("{}", "sig");

    expect(result).toEqual({ ok: true, event: verified });
    expect(other).not.toHaveBeenCalled();
  });

  it("dispatches each event type to its own handler", async () => {
    const queue = [
      event({ id: "evt_a", type: "invoice.paid" }),
      event({ id: "evt_b", type: "invoice.payment_failed" }),
    ];
    const router = createBillingWebhookRouter(verifyingProvider(async () => queue.shift()!));
    const log: string[] = [];
    router.on("invoice.paid", async (e) => {
      log.push(`paid:${e.id}`);
    });
    router.on("invoice.payment_failed", async (e) => {
      log.push(`failed:${e.id}`);
    });

    await router.handleBillingWebhook("{}", "sig");
    await router.handleBillingWebhook("{}", "sig");

    expect(log).toEqual(["paid:evt_a", "failed:evt_b"]);
  });

  it("rejects a request that fails verification and reaches no handler", async () => {
    const router = createBillingWebhookRouter(
      verifyingProvider(async () => {
        throw new Error("No signatures found matching the expected signature for payload");
      }),
    );
    const handler = vi.fn(async () => {});
    router.on("invoice.paid", handler);

    const result = await router.handleBillingWebhook('{"type":"invoice.paid"}', "forged");

    expect(result).toEqual({
      ok: false,
      error: "No signatures found matching the expected signature for payload",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects when verification throws something that is not an Error", async () => {
    const router = createBillingWebhookRouter(
      verifyingProvider(async () => {
        throw "signature_mismatch";
      }),
    );

    const result = await router.handleBillingWebhook("{}", "forged");

    expect(result).toEqual({ ok: false, error: "signature_mismatch" });
  });

  it("reports a handler failure with the verified event attached", async () => {
    const verified = event({ type: "invoice.payment_failed" });
    const router = createBillingWebhookRouter(verifyingProvider(async () => verified));
    router.on("invoice.payment_failed", async () => {
      throw new Error("Handler exploded");
    });

    const result = await router.handleBillingWebhook("{}", "sig");

    expect(result).toEqual({ ok: false, event: verified, error: "Handler exploded" });
  });

  it("reports a handler that throws something that is not an Error", async () => {
    const verified = event();
    const router = createBillingWebhookRouter(verifyingProvider(async () => verified));
    router.on("invoice.paid", async () => {
      throw "handler_rejected";
    });

    const result = await router.handleBillingWebhook("{}", "sig");

    expect(result).toEqual({ ok: false, event: verified, error: "handler_rejected" });
  });

  it("replaces the handler for a type when one is registered again", async () => {
    const router = createBillingWebhookRouter(verifyingProvider(async () => event()));
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    router.on("invoice.paid", first);
    router.on("invoice.paid", second);

    await router.handleBillingWebhook("{}", "sig");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
