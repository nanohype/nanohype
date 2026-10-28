// ── Invoicing Types ────────────────────────────────────────────────
//
// Interfaces specific to the invoice generation subsystem.
//

import type { BillingPeriod, Invoice, InvoiceIdGenerator, LineItem } from "../types.js";

/** Configuration for the invoice generator. */
export interface InvoiceGeneratorConfig {
  /** Currency code (default: "usd"). */
  currency?: string;

  /**
   * Derives an invoice's ID from its customer, billing period and sequence.
   * Defaults to deriveInvoiceId(), which returns the same ID for the same
   * three. A payment provider charges an ID once, so a generator that returns
   * a fresh ID per call lets the same period be charged again, and charging
   * an ID with other content than it was first charged with reports
   * `invoice_content_changed`.
   */
  idGenerator?: InvoiceIdGenerator;
}

/** Options for generating one invoice. */
export interface GenerateInvoiceOptions {
  /**
   * The invoices already charged for this customer and period: the period's
   * invoices with sequences 0 up to one less than their count, in any order.
   * When given, the invoice bills only what they leave out — per metric, the
   * amount and quantity past what their lines of that metric bill — under the
   * next sequence. A metric they fully bill gets no line, so the invoice has
   * no lines when they bill everything.
   *
   * Generating throws when one of them is not among those invoices, is in
   * another currency, or bills more for a metric than the period's usage of
   * it comes to: an invoice of what is left cannot bill less than nothing.
   */
  billed?: Invoice[];
}

/** An invoice generator that creates invoices from aggregated usage. */
export interface InvoiceGenerator {
  /** Generate an invoice from line items for a customer and billing period. */
  generate(
    customerId: string,
    period: BillingPeriod,
    lineItems: LineItem[],
    options?: GenerateInvoiceOptions,
  ): Invoice;
}

/** Supported invoice output formats. */
export type InvoiceFormat = "json" | "markdown";
