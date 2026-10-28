// ── Payment Provider Interface ─────────────────────────────────────
//
// All payment providers implement this interface. The registry pattern
// allows new providers to be added by importing a provider module
// that calls registerProvider() at the module level.
//

import type {
  BillingConfig,
  BillingWebhookEvent,
  ChargeOptions,
  ChargeResult,
  Customer,
  Invoice,
  Subscription,
} from "../types.js";

export interface PaymentProvider {
  /** Unique provider name (e.g., "stripe", "mock"). */
  readonly name: string;

  /** Initialize the provider with configuration. */
  init(config: BillingConfig): Promise<void>;

  /** Create a customer in the payment system. */
  createCustomer(email: string, name: string, metadata?: Record<string, string>): Promise<Customer>;

  /** Create a subscription for a customer. */
  createSubscription(customerId: string, planId: string): Promise<Subscription>;

  /**
   * Charge an invoice through the payment system. Charging an invoice ID a
   * second time must resume the first charge, not start another: a caller
   * retries this after a timeout without knowing whether the first attempt
   * landed, and an invoice regenerated for the same customer and period
   * carries the same ID. The mock remembers every ID it charged until it is
   * closed. The Stripe provider finds the Stripe invoice it wrote for the ID
   * among the customer's newest MAX_LISTED Stripe invoices
   * (`providers/stripe.ts`), so a replay that falls outside them is charged
   * again once Stripe has dropped the first attempt's idempotency keys, which
   * it holds for at least 24 hours.
   *
   * Once `options.signal` aborts, the charge makes no further call to the
   * payment system and reports `ok: false`.
   */
  chargeInvoice(invoice: Invoice, options?: ChargeOptions): Promise<ChargeResult>;

  /**
   * Verify an incoming webhook and return the event it carries. A provider
   * throws when the signature does not verify against the raw `payload`
   * bytes, so no unverified event reaches a handler. The mock, selectable
   * only by name, is the exception: it accepts any signature.
   */
  handleWebhook(payload: string, signature: string): Promise<BillingWebhookEvent>;

  /** List invoices for a customer. */
  listInvoices(customerId: string): Promise<Invoice[]>;

  /** Gracefully shut down the provider, releasing resources. */
  close(): Promise<void>;
}
