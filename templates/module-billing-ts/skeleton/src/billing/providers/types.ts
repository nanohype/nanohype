// ── Payment Provider Interface ─────────────────────────────────────
//
// All payment providers implement this interface. The registry pattern
// allows new providers to be added by importing a provider module
// that calls registerProvider() at the module level.
//

import type {
  BillingConfig,
  Customer,
  Subscription,
  Invoice,
  ChargeResult,
  BillingWebhookEvent,
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

  /** Charge an invoice through the payment system. */
  chargeInvoice(invoice: Invoice): Promise<ChargeResult>;

  /**
   * Handle an incoming webhook from the payment provider.
   * Verifies signature and returns parsed event.
   */
  handleWebhook(payload: string, signature: string): Promise<BillingWebhookEvent>;

  /** List invoices for a customer. */
  listInvoices(customerId: string): Promise<Invoice[]>;

  /** Gracefully shut down the provider, releasing resources. */
  close(): Promise<void>;
}
