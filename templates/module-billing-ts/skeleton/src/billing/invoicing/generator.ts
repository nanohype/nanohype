import { createHash } from "node:crypto";
import { logger } from "../logger.js";
import { billingInvoiceGenerated } from "../metrics.js";
import type { BillingPeriod, Invoice, LineItem } from "../types.js";
import { sameCurrency } from "./content.js";
import type { GenerateInvoiceOptions, InvoiceGenerator, InvoiceGeneratorConfig } from "./types.js";

// ── Invoice Generator ──────────────────────────────────────────────
//
// Takes aggregated line items and produces a structured Invoice.
// Each invoice gets an ID derived from its customer, billing period and
// sequence, sums all line items into a total, and is stamped with the
// billing period and creation timestamp. Given the invoices already
// billed for the period, it invoices only what they leave out.
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
 * The default invoice ID: a SHA-256 digest of the customer, the instants that
 * bound the billing period, and the invoice's sequence within the period.
 * Generating an invoice for the same customer, period and sequence again
 * yields the same ID, and a payment provider charges an ID once: charging the
 * same content again resumes the first charge. The ID does not cover what the
 * invoice bills. Usage recorded after a period was charged regenerates the
 * same ID with more on it, and charging that reports
 * `invoice_content_changed`; the difference is billed under the next
 * sequence by generating with the invoices already billed.
 */
export function deriveInvoiceId(customerId: string, period: BillingPeriod, sequence = 0): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([customerId, instant(period.start), instant(period.end), sequence]))
    .digest("hex");
  return `inv_${digest.slice(0, 32)}`;
}

interface MetricTotal {
  quantity: number;
  amount: number;
}

/** Quantity and amount per metric across `lines`. */
function totalsByMetric(lines: LineItem[]): Map<string, MetricTotal> {
  const totals = new Map<string, MetricTotal>();
  for (const line of lines) {
    const total = totals.get(line.metric) ?? { quantity: 0, amount: 0 };
    totals.set(line.metric, {
      quantity: total.quantity + line.quantity,
      amount: total.amount + line.amount,
    });
  }
  return totals;
}

/**
 * What `lineItems` bill past `billed`, one line per metric. A line's amount is
 * the metric's whole amount less what billed lines of that metric bill, so
 * tiered pricing charges the remainder at the tiers the whole quantity
 * reaches rather than restarting from the first tier.
 */
function unbilledLines(lineItems: LineItem[], billed: Invoice[]): LineItem[] {
  const usage = totalsByMetric(lineItems);
  const earlier = totalsByMetric(billed.flatMap((invoice) => invoice.lineItems));

  for (const [metric, charged] of earlier) {
    const owed = usage.get(metric)?.amount ?? 0;
    if (charged.amount > owed) {
      throw new Error(
        `Invoices already billed ${charged.amount} for ${metric}, more than its usage comes to (${owed})`,
      );
    }
  }

  const lines: LineItem[] = [];
  for (const [metric, total] of usage) {
    const charged = earlier.get(metric) ?? { quantity: 0, amount: 0 };
    const amount = total.amount - charged.amount;
    if (amount === 0) continue;
    const quantity = total.quantity - charged.quantity;
    const first = lineItems.find((item) => item.metric === metric)!;
    lines.push({
      ...first,
      description: `${first.description} (${quantity} not yet billed)`,
      quantity,
      unitPrice: quantity > 0 ? Math.round(amount / quantity) : 0,
      amount,
    });
  }
  return lines;
}

/**
 * Create an invoice generator.
 *
 *   const generator = createInvoiceGenerator({ currency: "usd" });
 *
 *   const invoice = generator.generate("cus-1", period, lineItems);
 *   const rest = generator.generate("cus-1", period, moreLineItems, { billed: [invoice] });
 */
export function createInvoiceGenerator(config: InvoiceGeneratorConfig = {}): InvoiceGenerator {
  const currency = config.currency ?? "usd";
  const idGen = config.idGenerator ?? deriveInvoiceId;

  /**
   * Throws unless `billed` is this period's invoices 0 to n-1, in this
   * generator's currency, with every line naming the metric and quantity it
   * billed: the usage they leave out is computed from those. A line a payment
   * provider lists with no metric is one no charge of this module wrote, such
   * as a subscription line, and its quantity measures nothing metered here.
   */
  function checkBilled(customerId: string, period: BillingPeriod, billed: Invoice[]): void {
    const expected = billed.map((_, sequence) => idGen(customerId, period, sequence));
    const given = new Set(billed.map((invoice) => invoice.id));
    if (expected.some((id) => !given.has(id))) {
      throw new Error(
        `billed must be the invoices already generated for customer ${customerId} and this period, sequences 0 to ${billed.length - 1}: expected ${expected.join(", ")}, got ${[...given].join(", ")}`,
      );
    }
    const foreign = billed.find((invoice) => !sameCurrency(invoice.currency, currency));
    if (foreign !== undefined) {
      throw new Error(`Invoice ${foreign.id} bills in ${foreign.currency}, not ${currency}`);
    }
    for (const invoice of billed) {
      const index = invoice.lineItems.findIndex(
        (line) => line.metric === "" || !Number.isFinite(line.quantity),
      );
      if (index !== -1) {
        throw new Error(
          `Invoice ${invoice.id} line ${index} names no metric or quantity it billed; billed takes the invoices generateInvoice returned, or listInvoices lists under the ID they were charged under`,
        );
      }
    }
  }

  return {
    generate(
      customerId: string,
      period: BillingPeriod,
      lineItems: LineItem[],
      options: GenerateInvoiceOptions = {},
    ): Invoice {
      const billed = options.billed ?? [];
      checkBilled(customerId, period, billed);
      const lines = billed.length === 0 ? lineItems : unbilledLines(lineItems, billed);
      const totalAmount = lines.reduce((sum, item) => sum + item.amount, 0);

      const invoice: Invoice = {
        id: idGen(customerId, period, billed.length),
        customerId,
        periodStart: period.start,
        periodEnd: period.end,
        lineItems: lines,
        totalAmount,
        currency,
        status: "draft",
        createdAt: new Date().toISOString(),
      };

      billingInvoiceGenerated.add(1, { status: "draft" });
      logger.info("Invoice generated", {
        invoiceId: invoice.id,
        customerId,
        sequence: billed.length,
        totalAmount,
        lineItemCount: lines.length,
      });

      return invoice;
    },
  };
}
