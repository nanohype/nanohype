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

/**
 * Format an amount held in the currency's smallest unit. The unit is the
 * currency's own: a cent for USD, a whole yen for JPY, a fils (1/1000) for
 * KWD — so the amount is scaled by the fraction digits Intl reports for that
 * currency rather than by 100. A fixed locale keeps the output stable across
 * hosts.
 *
 * A currency format given no digit options rounds to fraction digits, and
 * ECMA-402 sets its maximumFractionDigits from the currency's minor-unit
 * digits, so the option is always present here. TypeScript types it optional
 * because a format that rounds to significant digits leaves it unset.
 */
function formatCurrency(amountInMinorUnits: number, currency: string): string {
  const format = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const fractionDigits = format.resolvedOptions().maximumFractionDigits!;
  return format.format(amountInMinorUnits / 10 ** fractionDigits);
}
