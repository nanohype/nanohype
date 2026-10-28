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
   * Charge an invoice through the payment system.
   *
   * Charging an invoice ID a second time must resume the first charge, not
   * start another: a caller retries this after a timeout without knowing
   * whether the first attempt landed, and an invoice regenerated for the same
   * customer and period carries the same ID. The second charge compares the
   * invoice with what the first one wrote — the currency, and line for line
   * the amount, metric and quantity:
   *
   * - The same content resumes. Whatever the first charge left unfinished is
   *   finished, and an invoice it paid is reported paid with `collected: 0`.
   * - Other content on an invoice the first charge issued is reported as
   *   `invoice_content_changed` with what that invoice bills, and the issued
   *   invoice is left as it is. Reporting it paid would leave the difference
   *   unbilled with nothing to say so.
   * - Other content on an invoice the first charge never issued replaces it,
   *   since nothing on it was billed.
   *
   * A provider that finds the first charge by searching the payment system
   * documents how far back the search reaches. A first charge beyond it is
   * charged again once the payment system no longer recognizes the retry.
   * The mock remembers every ID it charged until it is closed.
   *
   * Once `options.signal` aborts, the charge makes no further call to the
   * payment system and reports `aborted`. A call already in flight is not
   * interrupted.
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
