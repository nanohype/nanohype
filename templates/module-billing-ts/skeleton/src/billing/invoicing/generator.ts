import { createHash } from "node:crypto";
import { logger } from "../logger.js";
import { billingInvoiceGenerated } from "../metrics.js";
import type { BillingPeriod, Invoice, LineItem } from "../types.js";
import type { InvoiceGenerator, InvoiceGeneratorConfig } from "./types.js";

// ── Invoice Generator ──────────────────────────────────────────────
//
// Takes aggregated line items and produces a structured Invoice.
// Each invoice gets an ID derived from its customer and billing period,
// sums all line items into a total, and is stamped with the billing
// period and creation timestamp.
//

/**
 * The instant an ISO-8601 period bound names, so two spellings of one instant
 * (`…T00:00:00Z` and `…T00:00:00.000Z`) derive one ID. A bound that does not
 * parse is kept as written rather than collapsed with every other such bound.
 */
function instant(bound: string): number | string {
  const ms = Date.parse(bound);
  return Number.isNaN(ms) ? bound : ms;
}

/**
 * The default invoice ID: a SHA-256 digest of the customer and the instants
 * that bound the billing period. Generating an invoice for the same customer
 * and period again yields the same ID, and a payment provider charges an ID
 * once, so regenerating an invoice that was already charged charges nothing
 * new.
 */
export function deriveInvoiceId(customerId: string, period: BillingPeriod): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([customerId, instant(period.start), instant(period.end)]))
    .digest("hex");
  return `inv_${digest.slice(0, 32)}`;
}

/**
 * Create an invoice generator.
 *
 *   const generator = createInvoiceGenerator({ currency: "usd" });
 *
 *   const invoice = generator.generate("cus-1", period, lineItems);
 */
export function createInvoiceGenerator(config: InvoiceGeneratorConfig = {}): InvoiceGenerator {
  const currency = config.currency ?? "usd";
  const idGen = config.idGenerator ?? deriveInvoiceId;

  return {
    generate(customerId: string, period: BillingPeriod, lineItems: LineItem[]): Invoice {
      const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

      const invoice: Invoice = {
        id: idGen(customerId, period),
        customerId,
        periodStart: period.start,
        periodEnd: period.end,
        lineItems,
        totalAmount,
        currency,
        status: "draft",
        createdAt: new Date().toISOString(),
      };

      billingInvoiceGenerated.add(1, { status: "draft" });
      logger.info("Invoice generated", {
        invoiceId: invoice.id,
        customerId,
        totalAmount,
        lineItemCount: lineItems.length,
      });

      return invoice;
    },
  };
}
