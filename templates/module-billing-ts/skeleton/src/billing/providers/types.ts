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
   * - An invoice the charge issues itself is checked the same way before it
   *   is paid, so a charge whose draft a concurrent charge of the ID with
   *   other content emptied reports `invoice_content_changed`, not paid.
   *
   * `collected` is what this call's own payment request collected, so a
   * payment is counted by at most one call however many charges reach it.
   *
   * A provider that finds the first charge by searching the payment system
   * fails closed wherever the search could miss it or misread it. A search
   * that ends at its bound without finding one reports `lookup_exhausted`
   * and writes nothing, unless `options.assumeUncharged` says to charge
   * anyway. A read of the first charge's lines that ends at its bound
   * reports `lookup_exhausted` with that charge's `externalId`, whatever the
   * options, since lines it has not read cannot be compared. A charge so
   * early that a later search would not reach back to it is refused as
   * `before_charge_window`. The mock remembers every ID it charged until it
   * is closed, so it reports neither.
   *
   * Once `options.signal` aborts, the charge makes no further call to the
   * payment system and reports `aborted`. A call already in flight is not
   * interrupted.
   *
   * Every outcome is reported as a ChargeResult. The built-in providers throw
   * only when they are not running, and the billing service passes any throw
   * on to its caller as a rejection.
   */
  chargeInvoice(invoice: Invoice, options?: ChargeOptions): Promise<ChargeResult>;

  /**
   * Verify an incoming webhook and return the event it carries. A provider
   * throws when the signature does not verify against the raw `payload`
   * bytes, so no unverified event reaches a handler. A provider that cannot
   * verify any request, because it holds no signing secret or is not
   * running, throws ProviderConfigError, which the webhook router reports as
   * `misconfigured` rather than `unverified`. The mock, selectable only by
   * name, is the exception: it accepts any signature.
   */
  handleWebhook(payload: string, signature: string): Promise<BillingWebhookEvent>;

  /** List invoices for a customer. */
  listInvoices(customerId: string): Promise<Invoice[]>;

  /** Gracefully shut down the provider, releasing resources. */
  close(): Promise<void>;
}
