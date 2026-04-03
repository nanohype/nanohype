// ── Invoicing Types ────────────────────────────────────────────────
//
// Interfaces specific to the invoice generation subsystem.
//

import type { BillingPeriod, Invoice, LineItem } from "../types.js";

/** Configuration for the invoice generator. */
export interface InvoiceGeneratorConfig {
  /** Currency code (default: "usd"). */
  currency?: string;

  /** Optional custom ID generator. Defaults to crypto.randomUUID(). */
  idGenerator?: () => string;
}

/** An invoice generator that creates invoices from aggregated usage. */
export interface InvoiceGenerator {
  /** Generate an invoice from line items for a customer and billing period. */
  generate(
    customerId: string,
    period: BillingPeriod,
    lineItems: LineItem[],
  ): Invoice;
}

/** Supported invoice output formats. */
export type InvoiceFormat = "json" | "markdown";
