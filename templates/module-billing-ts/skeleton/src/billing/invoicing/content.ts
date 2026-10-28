import type { Invoice, LineItem } from "../types.js";

// ── Invoice Content ────────────────────────────────────────────────
//
// What it means for two invoices to bill the same thing. A payment
// provider charges an invoice ID once, and charging the ID again compares
// the invoice with what the first charge wrote: the same content resumes
// that charge, and other content is reported rather than paid. Every
// provider and the invoice generator decide sameness here, so a charge
// reads the same invoice the same way whichever provider runs it.
//

/** What an invoice bills: its currency and its lines, in order. */
export type InvoiceContent = Pick<Invoice, "currency" | "lineItems">;

/**
 * True when two currency codes name one currency. ISO 4217 codes carry no
 * meaning in their case, and a payment provider can hand a code back in
 * another case than it was sent in: Stripe holds every currency lowercased.
 */
export function sameCurrency(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * True when two lines bill the same: the same amount, metric and quantity.
 * The description and unit price describe a line rather than bill it, so
 * they are not compared.
 */
export function billsSameLine(
  a: Pick<LineItem, "amount" | "metric" | "quantity">,
  b: Pick<LineItem, "amount" | "metric" | "quantity">,
): boolean {
  return a.amount === b.amount && a.metric === b.metric && a.quantity === b.quantity;
}

/**
 * True when two invoices bill the same content: one currency, and line for
 * line, in order, lines that bill the same.
 */
export function billsSameContent(a: InvoiceContent, b: InvoiceContent): boolean {
  return (
    sameCurrency(a.currency, b.currency) &&
    a.lineItems.length === b.lineItems.length &&
    a.lineItems.every((line, index) => billsSameLine(line, b.lineItems[index]!))
  );
}
