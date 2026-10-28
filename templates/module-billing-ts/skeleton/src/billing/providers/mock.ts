import { logger } from "../logger.js";
import type {
  BillingConfig,
  BillingWebhookEvent,
  ChargeOptions,
  ChargeResult,
  Customer,
  Invoice,
  Subscription,
} from "../types.js";
import { registerProvider } from "./registry.js";
import type { PaymentProvider } from "./types.js";

// ── Mock Payment Provider ──────────────────────────────────────────
//
// Factory that creates an in-memory payment provider for testing and
// local development. All mutable state (customers, subscriptions,
// invoices, counters) lives inside the factory closure — each call
// to createMockProvider() yields an isolated instance.
//
// The mock accepts every webhook signature and reports every charge as
// paid, so init() refuses to start unless the config names it as the
// provider — a default or a fallback never lands a deployment on it.
//

/** An invoice the mock charged, under the ID it charged it as. */
type ChargedInvoice = Invoice & { externalId: string };

/**
 * True when two invoices bill the same: one currency, and line for line the
 * same amount, metric and quantity.
 */
function billsTheSame(charged: Invoice, invoice: Invoice): boolean {
  return (
    charged.currency === invoice.currency &&
    charged.lineItems.length === invoice.lineItems.length &&
    charged.lineItems.every((line, index) => {
      const other = invoice.lineItems[index];
      return (
        line.amount === other.amount &&
        line.metric === other.metric &&
        line.quantity === other.quantity
      );
    })
  );
}

function createMockProvider(): PaymentProvider {
  const customers: Customer[] = [];
  const subscriptions: Subscription[] = [];
  const invoices: ChargedInvoice[] = [];

  let customerCounter = 0;
  let subscriptionCounter = 0;
  let invoiceCounter = 0;
  let eventCounter = 0;

  return {
    name: "mock",

    async init(config: BillingConfig): Promise<void> {
      if (config.provider !== "mock") {
        throw new Error(
          'The mock payment provider accepts any webhook signature and reports every charge as paid, so it runs only when named: pass { provider: "mock" }.',
        );
      }

      // Reset state on init
      customers.length = 0;
      subscriptions.length = 0;
      invoices.length = 0;
      customerCounter = 0;
      subscriptionCounter = 0;
      invoiceCounter = 0;
      eventCounter = 0;
      logger.debug("Mock payment provider initialized");
    },

    async createCustomer(
      email: string,
      name: string,
      metadata?: Record<string, string>,
    ): Promise<Customer> {
      customerCounter++;
      const id = `mock-cus-${customerCounter}`;

      const customer: Customer = {
        id,
        email,
        name,
        externalId: id,
        metadata: metadata ?? {},
      };

      customers.push(customer);
      logger.debug("Mock customer created", { id });

      return customer;
    },

    async createSubscription(customerId: string, planId: string): Promise<Subscription> {
      subscriptionCounter++;
      const id = `mock-sub-${subscriptionCounter}`;

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subscription: Subscription = {
        id,
        customerId,
        planId,
        status: "active",
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        externalId: id,
      };

      subscriptions.push(subscription);
      logger.debug("Mock subscription created", { id, customerId, planId });

      return subscription;
    },

    async chargeInvoice(invoice: Invoice, options: ChargeOptions = {}): Promise<ChargeResult> {
      // An aborted charge makes no call, and charging an invoice ID again
      // returns the first charge when it billed the same content and reports
      // the difference when it did not, as the PaymentProvider contract
      // requires of every provider. Every mock charge pays at once, so there
      // is no unissued invoice to replace.
      if (options.signal?.aborted) {
        const { reason } = options.signal;
        return {
          ok: false,
          code: "aborted",
          error: reason instanceof Error ? reason.message : String(reason),
        };
      }
      const previous = invoices.find((inv) => inv.id === invoice.id);
      if (previous && billsTheSame(previous, invoice)) {
        return { ok: true, externalId: previous.externalId, collected: 0 };
      }
      if (previous) {
        return {
          ok: false,
          code: "invoice_content_changed",
          externalId: previous.externalId,
          billedAmount: previous.totalAmount,
          error: `Mock charge ${previous.externalId} bills ${previous.totalAmount} ${previous.currency} for invoice ${invoice.id}, which totals ${invoice.totalAmount} ${invoice.currency}`,
        };
      }

      invoiceCounter++;
      const externalId = `mock-pi-${invoiceCounter}`;

      invoices.push({ ...invoice, status: "paid", externalId });
      logger.debug("Mock invoice charged", { externalId, amount: invoice.totalAmount });

      return { ok: true, externalId, collected: invoice.totalAmount };
    },

    async handleWebhook(payload: string, _signature: string): Promise<BillingWebhookEvent> {
      // Mock provider accepts any signature
      let parsed: { id?: string; type?: string; data?: unknown };
      try {
        parsed = JSON.parse(payload) as { id?: string; type?: string; data?: unknown };
      } catch {
        throw new Error("Invalid webhook payload: not valid JSON");
      }

      eventCounter++;
      return {
        id: parsed.id ?? `mock-evt-${eventCounter}`,
        type: parsed.type ?? "unknown",
        payload: parsed.data ?? parsed,
        timestamp: new Date().toISOString(),
      };
    },

    async listInvoices(customerId: string): Promise<Invoice[]> {
      return invoices.filter((inv) => inv.customerId === customerId);
    },

    async close(): Promise<void> {
      customers.length = 0;
      subscriptions.length = 0;
      invoices.length = 0;
      customerCounter = 0;
      subscriptionCounter = 0;
      invoiceCounter = 0;
      eventCounter = 0;
      logger.debug("Mock payment provider closed");
    },
  };
}

// Self-register factory
registerProvider("mock", createMockProvider);

export { createMockProvider };
