// ── Invoicing Types ────────────────────────────────────────────────
//
// Interfaces specific to the invoice generation subsystem.
//

import type { BillingPeriod, Invoice, LineItem } from "../types.js";

/** Configuration for the invoice generator. */
export interface InvoiceGeneratorConfig {
  /** Currency code (default: "usd"). */
  currency?: string;

  /**
   * Derives an invoice's ID from its customer and billing period. Defaults to
   * deriveInvoiceId(), which returns the same ID for the same customer and
   * period. A payment provider charges an ID once, so a generator that
   * returns a fresh ID per call lets the same period be charged again, and
   * charging an ID with other content than it was first charged with reports
   * `invoice_content_changed`.
   */
  idGenerator?: (customerId: string, period: BillingPeriod) => string;
}

/** An invoice generator that creates invoices from aggregated usage. */
export interface InvoiceGenerator {
  /** Generate an invoice from line items for a customer and billing period. */
  generate(customerId: string, period: BillingPeriod, lineItems: LineItem[]): Invoice;
}

/** Supported invoice output formats. */
export type InvoiceFormat = "json" | "markdown";
