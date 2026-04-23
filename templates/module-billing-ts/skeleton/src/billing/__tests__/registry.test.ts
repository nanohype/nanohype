import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { PaymentProvider } from "../providers/types.js";

/**
 * Build a minimal stub provider for testing the registry in isolation.
 */
function stubProvider(name: string): PaymentProvider {
  return {
    name,
    async init() {},
    async createCustomer(email: string, name: string) {
      return { id: "stub", email, name, metadata: {} };
    },
    async createSubscription(customerId: string, planId: string) {
      return {
        id: "stub",
        customerId,
        planId,
        status: "active" as const,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date().toISOString(),
      };
    },
    async chargeInvoice() {
      return { ok: true };
    },
    async handleWebhook() {
      return { type: "test", payload: null, timestamp: new Date().toISOString() };
    },
    async listInvoices() {
      return [];
    },
    async close() {},
  };
}

describe("payment provider registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a provider and retrieves it by name", () => {
    const name = unique();
    const provider = stubProvider(name);

    registerProvider(name, () => provider);

    expect(getProvider(name)).toBe(provider);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getProvider("nonexistent-provider")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerProvider(name, () => stubProvider(name));

    expect(() => registerProvider(name, () => stubProvider(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerProvider(a, () => stubProvider(a));
    registerProvider(b, () => stubProvider(b));

    const names = listProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
