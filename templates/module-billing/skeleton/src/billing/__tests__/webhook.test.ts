import { describe, it, expect, beforeEach, vi } from "vitest";

// Import mock provider to trigger self-registration
import "../providers/mock.js";
import { createBillingWebhookRouter } from "../webhooks/handler.js";
import { getProvider } from "../providers/registry.js";
import type { BillingWebhookEvent } from "../types.js";

describe("billing webhook handler", () => {
  beforeEach(async () => {
    const provider = getProvider("mock");
    await provider.close();
    await provider.init({});
  });

  it("verifies and dispatches a webhook event", async () => {
    const router = createBillingWebhookRouter("mock");

    const events: BillingWebhookEvent[] = [];
    router.on("invoice.paid", async (event) => {
      events.push(event);
    });

    const payload = JSON.stringify({
      type: "invoice.paid",
      data: { invoiceId: "inv-1", amount: 5000 },
    });

    const result = await router.handleBillingWebhook(payload, "any-signature");

    expect(result.ok).toBe(true);
    expect(result.event).toBeDefined();
    expect(result.event!.type).toBe("invoice.paid");
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("invoice.paid");
  });

  it("returns ok for events without a registered handler", async () => {
    const router = createBillingWebhookRouter("mock");

    const payload = JSON.stringify({
      type: "subscription.created",
      data: { subscriptionId: "sub-1" },
    });

    const result = await router.handleBillingWebhook(payload, "any-signature");

    expect(result.ok).toBe(true);
    expect(result.event!.type).toBe("subscription.created");
  });

  it("handles handler errors gracefully", async () => {
    const router = createBillingWebhookRouter("mock");

    router.on("payment_failed", async () => {
      throw new Error("Handler exploded");
    });

    const payload = JSON.stringify({
      type: "payment_failed",
      data: { reason: "card_declined" },
    });

    const result = await router.handleBillingWebhook(payload, "any-signature");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Handler exploded");
    expect(result.event).toBeDefined();
  });

  it("returns error for invalid webhook payload", async () => {
    const router = createBillingWebhookRouter("mock");

    const result = await router.handleBillingWebhook("not-json{", "sig");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid webhook payload");
  });

  it("dispatches multiple event types independently", async () => {
    const router = createBillingWebhookRouter("mock");

    const log: string[] = [];

    router.on("invoice.paid", async () => {
      log.push("invoice.paid");
    });

    router.on("subscription.created", async () => {
      log.push("subscription.created");
    });

    await router.handleBillingWebhook(
      JSON.stringify({ type: "invoice.paid", data: {} }),
      "sig",
    );

    await router.handleBillingWebhook(
      JSON.stringify({ type: "subscription.created", data: {} }),
      "sig",
    );

    expect(log).toEqual(["invoice.paid", "subscription.created"]);
  });
});
