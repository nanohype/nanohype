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
import type { GenerateInvoiceOptions, InvoiceFormat } from "./invoicing/types.js";
import { logger } from "./logger.js";
import { createUsageAggregator } from "./metering/aggregator.js";
import { createUsageTracker } from "./metering/tracker.js";
import { billingChargeCalls, billingPaymentTotal } from "./metrics.js";
import { getProvider } from "./providers/index.js";
import type {
  BillingConfig,
  BillingPeriod,
  ChargeOptions,
  ChargeResult,
  Customer,
  Invoice,
  Subscription,
  UsageRecord,
  UsageSummary,
} from "./types.js";
import type { WebhookEventHandler, WebhookResult } from "./webhooks/handler.js";
import { createBillingWebhookRouter } from "./webhooks/handler.js";

export { DEFAULT_PROVIDER } from "./config.js";
export {
  billsSameContent,
  billsSameLine,
  type InvoiceContent,
  sameCurrency,
} from "./invoicing/content.js";
export { formatInvoice } from "./invoicing/formatter.js";
export { createInvoiceGenerator, deriveInvoiceId } from "./invoicing/generator.js";
export type { GenerateInvoiceOptions, InvoiceFormat } from "./invoicing/types.js";
export { createUsageAggregator } from "./metering/aggregator.js";
export { createUsageTracker } from "./metering/tracker.js";
// Re-export everything consumers need
export {
  getProvider,
  listProviders,
  ProviderConfigError,
  registerProvider,
} from "./providers/index.js";
export type { StripeConfig, StripeHttpClient } from "./providers/stripe-config.js";
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
  InvoiceIdGenerator,
  LineItem,
  PricingRule,
  PricingTier,
  ProviderConfigs,
  Subscription,
  SubscriptionStatus,
  UsageRecord,
  UsageSummary,
} from "./types.js";
export type {
  BillingWebhookRouter,
  WebhookEventHandler,
  WebhookHandled,
  WebhookHandlerFailed,
  WebhookMisconfigured,
  WebhookResult,
  WebhookUnverified,
} from "./webhooks/handler.js";
export { createBillingWebhookRouter } from "./webhooks/handler.js";

// ── Billing Service Facade ─────────────────────────────────────────

/**
 * The billing service. chargeInvoice and handleWebhook report outcomes as
 * results. handleWebhook never rejects. chargeInvoice rejects when its
 * provider throws instead of returning a result, which the built-in
 * providers do only when they are not running, such as after close().
 * createCustomer, createSubscription and listInvoices reject with the
 * provider's error.
 */
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
   * ID derives from the customer, the period, and its sequence within the
   * period, so generating the same period again yields an invoice with the
   * same ID.
   *
   * With `options.billed`, the invoices already charged for this customer and
   * period, it invoices only the usage they leave out, under the period's
   * next sequence. That is how usage recorded after a charge is billed once
   * charging the regenerated invoice reports `invoice_content_changed`.
   */
  generateInvoice(
    customerId: string,
    period: BillingPeriod,
    options?: GenerateInvoiceOptions,
  ): Invoice;

  /** Format an invoice as a string (json or markdown). */
  formatInvoice(invoice: Invoice, format: InvoiceFormat): string;

  /**
   * Charge an invoice through the payment provider. Charging an invoice ID a
   * second time resumes the first charge; `PaymentProvider.chargeInvoice`
   * sets out that contract, which every provider meets, and `ChargeResult`
   * what each outcome means.
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
  handleWebhook(payload: string, signature: string): Promise<WebhookResult>;

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
  const invoiceGen = createInvoiceGenerator({ currency, idGenerator: config.idGenerator });
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

    generateInvoice(
      customerId: string,
      period: BillingPeriod,
      options?: GenerateInvoiceOptions,
    ): Invoice {
      const summary = computeUsageSummary(customerId, period);
      return invoiceGen.generate(customerId, period, summary.lineItems, options);
    },

    formatInvoice(invoice: Invoice, format: InvoiceFormat): string {
      return formatInvoice(invoice, format);
    },

    async chargeInvoice(invoice: Invoice, options?: ChargeOptions): Promise<ChargeResult> {
      const result = await provider.chargeInvoice(invoice, options);

      // The amount series takes what this call collected, never the invoice
      // total, so a resumed or replayed charge adds nothing; a failure adds a
      // call, not an amount, so retrying one invoice inflates no sum.
      billingChargeCalls.add(1, { result: result.ok ? "paid" : result.code });
      if (result.ok) {
        billingPaymentTotal.add(result.collected, { currency: invoice.currency.toLowerCase() });
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

    async handleWebhook(payload: string, signature: string): Promise<WebhookResult> {
      return webhookRouter.handleBillingWebhook(payload, signature);
    },

    async close(): Promise<void> {
      await provider.close();
      tracker.clear();
      logger.info("Billing service closed");
    },
  };
}
