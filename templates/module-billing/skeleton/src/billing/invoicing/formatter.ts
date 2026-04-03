import type { Invoice } from "../types.js";
import type { InvoiceFormat } from "./types.js";

// ── Invoice Formatter ──────────────────────────────────────────────
//
// Serializes an Invoice into a human-readable or machine-readable
// string. Supports JSON (round-trippable) and Markdown (display).
//

/**
 * Format an invoice as a string.
 *
 *   const json = formatInvoice(invoice, "json");
 *   const md = formatInvoice(invoice, "markdown");
 */
export function formatInvoice(invoice: Invoice, format: InvoiceFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(invoice, null, 2);

    case "markdown":
      return formatMarkdown(invoice);

    default:
      throw new Error(`Unsupported invoice format: ${format as string}`);
  }
}

function formatMarkdown(invoice: Invoice): string {
  const lines: string[] = [
    `# Invoice ${invoice.id}`,
    "",
    `**Customer:** ${invoice.customerId}`,
    `**Period:** ${invoice.periodStart} — ${invoice.periodEnd}`,
    `**Status:** ${invoice.status}`,
    `**Created:** ${invoice.createdAt}`,
    "",
    "## Line Items",
    "",
    "| Description | Quantity | Unit Price | Amount |",
    "|-------------|----------|------------|--------|",
  ];

  for (const item of invoice.lineItems) {
    const unitPrice = formatCurrency(item.unitPrice, invoice.currency);
    const amount = formatCurrency(item.amount, invoice.currency);
    lines.push(`| ${item.description} | ${item.quantity} | ${unitPrice} | ${amount} |`);
  }

  lines.push("");
  lines.push(`**Total:** ${formatCurrency(invoice.totalAmount, invoice.currency)}`);

  return lines.join("\n");
}

function formatCurrency(amountInCents: number, currency: string): string {
  const symbol = currency === "usd" ? "$" : currency.toUpperCase() + " ";
  const dollars = (amountInCents / 100).toFixed(2);
  return `${symbol}${dollars}`;
}
