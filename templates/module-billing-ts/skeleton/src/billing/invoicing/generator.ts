import { billingInvoiceGenerated } from "../metrics.js";
import { logger } from "../logger.js";
import type { BillingPeriod, Invoice, LineItem } from "../types.js";
import type { InvoiceGenerator, InvoiceGeneratorConfig } from "./types.js";

// ── Invoice Generator ──────────────────────────────────────────────
//
// Takes aggregated line items and produces a structured Invoice.
// Each invoice gets a unique ID, sums all line items into a total,
// and is stamped with the billing period and creation timestamp.
//

/**
 * Create an invoice generator.
 *
 *   const generator = createInvoiceGenerator({ currency: "usd" });
 *
 *   const invoice = generator.generate("cus-1", period, lineItems);
 */
export function createInvoiceGenerator(
  config: InvoiceGeneratorConfig = {},
): InvoiceGenerator {
  const currency = config.currency ?? "usd";
  const idGen = config.idGenerator ?? (() => crypto.randomUUID());

  return {
    generate(
      customerId: string,
      period: BillingPeriod,
      lineItems: LineItem[],
    ): Invoice {
      const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

      const invoice: Invoice = {
        id: idGen(),
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
