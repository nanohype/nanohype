// ── Module Billing — Main Exports ───────────────────────────────────
//
// Public API for the billing module. Import providers so they
// self-register, then expose createBillingService as the primary
// entry point. The service facade unifies usage metering, invoice
// generation, payment processing, and webhook handling behind a
// single factory function.
//

import { validateBootstrap } from "./bootstrap.js";
import { DEFAULT_PROVIDER, validateConfig } from "./config.js";
import { formatInvoice } from "./invoicing/formatter.js";
import { createInvoiceGenerator } from "./invoicing/generator.js";
import type { InvoiceFormat } from "./invoicing/types.js";
import { logger } from "./logger.js";
import { createUsageAggregator } from "./metering/aggregator.js";
import { createUsageTracker } from "./metering/tracker.js";
import { billingPaymentTotal } from "./metrics.js";
import { getProvider } from "./providers/index.js";
import type {
  BillingConfig,
  BillingPeriod,
  BillingWebhookEvent,
  ChargeOptions,
  ChargeResult,
  Customer,
  Invoice,
  Subscription,
  UsageRecord,
  UsageSummary,
} from "./types.js";
import type { WebhookEventHandler } from "./webhooks/handler.js";
import { createBillingWebhookRouter } from "./webhooks/handler.js";

export { DEFAULT_PROVIDER } from "./config.js";
export { formatInvoice } from "./invoicing/formatter.js";
export { createInvoiceGenerator, deriveInvoiceId } from "./invoicing/generator.js";
export type { InvoiceFormat } from "./invoicing/types.js";
export { createUsageAggregator } from "./metering/aggregator.js";
export { createUsageTracker } from "./metering/tracker.js";
// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { PaymentProvider } from "./providers/types.js";
export type { CircuitBreakerConfig } from "./resilience/circuit-breaker.js";
export { CircuitBreaker } from "./resilience/circuit-breaker.js";
export { isEntitled } from "./subscriptions.js";
export type {
  BillingConfig,
  BillingPeriod,
  BillingWebhookEvent,
  ChargeContentChanged,
  ChargeFailed,
  ChargeFailureCode,
  ChargeOptions,
  ChargePaid,
  ChargeResult,
  Customer,
  Invoice,
  LineItem,
  PricingRule,
  PricingTier,
  Subscription,
  SubscriptionStatus,
  UsageRecord,
  UsageSummary,
} from "./types.js";
export type { BillingWebhookRouter, WebhookEventHandler } from "./webhooks/handler.js";
export { createBillingWebhookRouter } from "./webhooks/handler.js";

// ── Billing Service Facade ─────────────────────────────────────────

export interface BillingService {
  /** Name of the payment provider this service initialized. */
  readonly provider: string;

  /** Record a usage event for a customer. */
  recordUsage(
    customerId: string,
    metric: string,
    quantity: number,
    tags?: Record<string, string>,
  ): UsageRecord;

  /** Get aggregated usage summary for a customer and period. */
  getUsageSummary(customerId: string, period: BillingPeriod): UsageSummary;

  /**
   * Generate an invoice from aggregated usage for a customer and period. Its
   * ID derives from the customer and period, so generating the same period
   * again yields an invoice with the same ID.
   */
  generateInvoice(customerId: string, period: BillingPeriod): Invoice;

  /** Format an invoice as a string (json or markdown). */
  formatInvoice(invoice: Invoice, format: InvoiceFormat): string;

  /**
   * Charge an invoice through the payment provider. Charging an invoice ID a
   * second time — a retry after a timeout, or an invoice regenerated for the
   * same customer and period — resumes the first charge instead of starting
   * another, and `collected` reports only what this call collected. When the
   * first charge issued an invoice for other content, such as usage recorded
   * since, the result is `invoice_content_changed` with what that invoice
   * bills, never ok. How far back a provider finds the first charge is its
   * own bound, set out in `PaymentProvider.chargeInvoice` and documented by
   * each provider.
   *
   * Once `options.signal` aborts, the charge starts no further provider call
   * and reports `aborted`; charging the invoice again resumes it.
   */
  chargeInvoice(invoice: Invoice, options?: ChargeOptions): Promise<ChargeResult>;

  /** Create a customer in the payment provider. */
  createCustomer(email: string, name: string, metadata?: Record<string, string>): Promise<Customer>;

  /**
   * Subscribe a customer to a plan. Gate access on the returned status with
   * `isEntitled()`.
   */
  createSubscription(customerId: string, planId: string): Promise<Subscription>;

  /** List a customer's invoices as the payment provider records them. */
  listInvoices(customerId: string): Promise<Invoice[]>;

  /** Register a webhook event handler. */
  onWebhook(eventType: string, handler: WebhookEventHandler): void;

  /**
   * Verify an incoming billing webhook with the initialized provider and
   * dispatch it. `payload` is the raw request body, byte for byte; a body
   * that was parsed and re-serialized no longer matches its signature.
   */
  handleWebhook(
    payload: string,
    signature: string,
  ): Promise<{ ok: boolean; event?: BillingWebhookEvent; error?: string }>;

  /** Shut down the billing service and release resources. */
  close(): Promise<void>;
}

/**
 * Create a configured billing service. When `config.provider` is omitted the
 * service uses DEFAULT_PROVIDER, the provider this project was scaffolded
 * with; the mock provider starts only when named.
 *
 *   const billing = await createBillingService({
 *     provider: "stripe",
 *     currency: "usd",
 *     pricingRules: [
 *       { metric: "api_calls", model: "per_unit", unitPrice: 1 },
 *     ],
 *     stripe: { secretKey: process.env.STRIPE_SECRET_KEY },
 *   });
 *
 *   billing.recordUsage("cus-1", "api_calls", 100);
 *   const summary = billing.getUsageSummary("cus-1", period);
 *   const invoice = billing.generateInvoice("cus-1", period);
 *   const result = await billing.chargeInvoice(invoice);
 */
export async function createBillingService(config: BillingConfig = {}): Promise<BillingService> {
  validateBootstrap();
  validateConfig(config);

  const providerName = config.provider ?? DEFAULT_PROVIDER;
  const currency = config.currency ?? "usd";

  // The one provider instance this service uses. Payments, customers, and
  // webhook verification all go through it, because init() is what installs
  // the client and the signing secret.
  const provider = getProvider(providerName);
  await provider.init(config);

  // Create subsystem instances — all state is scoped to this service
  const tracker = createUsageTracker();
  const aggregator = createUsageAggregator({
    pricingRules: config.pricingRules,
    currency,
  });
  const invoiceGen = createInvoiceGenerator({ currency });
  const webhookRouter = createBillingWebhookRouter(provider);

  logger.info("Billing service created", { provider: providerName, currency });

  // Shared usage-summary computation — used by both the public
  // getUsageSummary method and generateInvoice. Lives in the closure
  // so callers don't depend on the returned object's `this` type.
  function computeUsageSummary(customerId: string, period: BillingPeriod): UsageSummary {
    const records = tracker.getRecords(customerId, period);
    return aggregator.aggregate(records, customerId, period);
  }

  return {
    provider: providerName,

    recordUsage(
      customerId: string,
      metric: string,
      quantity: number,
      tags?: Record<string, string>,
    ): UsageRecord {
      return tracker.record({ customerId, metric, quantity, tags });
    },

    getUsageSummary(customerId: string, period: BillingPeriod): UsageSummary {
      return computeUsageSummary(customerId, period);
    },

    generateInvoice(customerId: string, period: BillingPeriod): Invoice {
      const summary = computeUsageSummary(customerId, period);
      return invoiceGen.generate(customerId, period, summary.lineItems);
    },

    formatInvoice(invoice: Invoice, format: InvoiceFormat): string {
      return formatInvoice(invoice, format);
    },

    async chargeInvoice(invoice: Invoice, options?: ChargeOptions): Promise<ChargeResult> {
      const result = await provider.chargeInvoice(invoice, options);

      // A resumed charge of a paid invoice collects nothing, so success counts
      // what the provider reports this call collected, never the invoice total.
      if (result.ok) {
        billingPaymentTotal.add(result.collected, { result: "success" });
      } else {
        billingPaymentTotal.add(invoice.totalAmount, { result: "failure", code: result.code });
      }

      return result;
    },

    createCustomer(
      email: string,
      name: string,
      metadata?: Record<string, string>,
    ): Promise<Customer> {
      return provider.createCustomer(email, name, metadata);
    },

    createSubscription(customerId: string, planId: string): Promise<Subscription> {
      return provider.createSubscription(customerId, planId);
    },

    listInvoices(customerId: string): Promise<Invoice[]> {
      return provider.listInvoices(customerId);
    },

    onWebhook(eventType: string, handler: WebhookEventHandler): void {
      webhookRouter.on(eventType, handler);
    },

    async handleWebhook(
      payload: string,
      signature: string,
    ): Promise<{ ok: boolean; event?: BillingWebhookEvent; error?: string }> {
      return webhookRouter.handleBillingWebhook(payload, signature);
    },

    async close(): Promise<void> {
      await provider.close();
      tracker.clear();
      logger.info("Billing service closed");
    },
  };
}
