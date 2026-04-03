// ── Module Billing — Main Exports ───────────────────────────────────
//
// Public API for the billing module. Import providers so they
// self-register, then expose createBillingService as the primary
// entry point. The service facade unifies usage metering, invoice
// generation, payment processing, and webhook handling behind a
// single factory function.
//

import { validateBootstrap } from "./bootstrap.js";
import { validateConfig } from "./config.js";
import { createUsageTracker } from "./metering/tracker.js";
import { createUsageAggregator } from "./metering/aggregator.js";
import { createInvoiceGenerator } from "./invoicing/generator.js";
import { formatInvoice } from "./invoicing/formatter.js";
import { createBillingWebhookRouter } from "./webhooks/handler.js";
import { getProvider, listProviders } from "./providers/index.js";
import { billingPaymentTotal } from "./metrics.js";
import { logger } from "./logger.js";
import type {
  BillingConfig,
  BillingPeriod,
  UsageRecord,
  UsageSummary,
  Invoice,
  ChargeResult,
  BillingWebhookEvent,
} from "./types.js";
import type { InvoiceFormat } from "./invoicing/types.js";
import type { WebhookEventHandler } from "./webhooks/handler.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export { createUsageTracker } from "./metering/tracker.js";
export { createUsageAggregator } from "./metering/aggregator.js";
export { createInvoiceGenerator } from "./invoicing/generator.js";
export { formatInvoice } from "./invoicing/formatter.js";
export { createBillingWebhookRouter } from "./webhooks/handler.js";
export { CircuitBreaker } from "./resilience/circuit-breaker.js";
export type { PaymentProvider } from "./providers/types.js";
export type { InvoiceFormat } from "./invoicing/types.js";
export type { WebhookEventHandler } from "./webhooks/handler.js";
export type {
  UsageRecord,
  Invoice,
  Subscription,
  Customer,
  BillingConfig,
  LineItem,
  BillingPeriod,
  PricingRule,
  PricingTier,
  UsageSummary,
  ChargeResult,
  BillingWebhookEvent,
} from "./types.js";

// ── Billing Service Facade ─────────────────────────────────────────

export interface BillingService {
  /** Record a usage event for a customer. */
  recordUsage(
    customerId: string,
    metric: string,
    quantity: number,
    tags?: Record<string, string>,
  ): UsageRecord;

  /** Get aggregated usage summary for a customer and period. */
  getUsageSummary(customerId: string, period: BillingPeriod): UsageSummary;

  /** Generate an invoice from aggregated usage for a customer and period. */
  generateInvoice(customerId: string, period: BillingPeriod): Invoice;

  /** Format an invoice as a string (json or markdown). */
  formatInvoice(invoice: Invoice, format: InvoiceFormat): string;

  /** Charge an invoice through the payment provider. */
  chargeInvoice(invoice: Invoice): Promise<ChargeResult>;

  /** Register a webhook event handler. */
  onWebhook(eventType: string, handler: WebhookEventHandler): void;

  /** Handle an incoming billing webhook. */
  handleWebhook(
    payload: string,
    signature: string,
  ): Promise<{ ok: boolean; event?: BillingWebhookEvent; error?: string }>;

  /** Shut down the billing service and release resources. */
  close(): Promise<void>;
}

/**
 * Create a configured billing service.
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
export async function createBillingService(
  config: BillingConfig = {},
): Promise<BillingService> {
  validateBootstrap();
  validateConfig(config);

  const providerName = config.provider ?? "__PAYMENT_PROVIDER__";
  const currency = config.currency ?? "usd";

  // Initialize the payment provider
  const provider = getProvider(providerName);
  await provider.init(config);

  // Create subsystem instances — all state is scoped to this service
  const tracker = createUsageTracker();
  const aggregator = createUsageAggregator({
    pricingRules: config.pricingRules,
    currency,
  });
  const invoiceGen = createInvoiceGenerator({ currency });
  const webhookRouter = createBillingWebhookRouter(providerName);

  logger.info("Billing service created", { provider: providerName, currency });

  return {
    recordUsage(
      customerId: string,
      metric: string,
      quantity: number,
      tags?: Record<string, string>,
    ): UsageRecord {
      return tracker.record({ customerId, metric, quantity, tags });
    },

    getUsageSummary(customerId: string, period: BillingPeriod): UsageSummary {
      const records = tracker.getRecords(customerId, period);
      return aggregator.aggregate(records, customerId, period);
    },

    generateInvoice(customerId: string, period: BillingPeriod): Invoice {
      const summary = this.getUsageSummary(customerId, period);
      return invoiceGen.generate(customerId, period, summary.lineItems);
    },

    formatInvoice(invoice: Invoice, format: InvoiceFormat): string {
      return formatInvoice(invoice, format);
    },

    async chargeInvoice(invoice: Invoice): Promise<ChargeResult> {
      const result = await provider.chargeInvoice(invoice);

      if (result.ok) {
        billingPaymentTotal.add(invoice.totalAmount, { result: "success" });
      } else {
        billingPaymentTotal.add(invoice.totalAmount, { result: "failure" });
      }

      return result;
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
