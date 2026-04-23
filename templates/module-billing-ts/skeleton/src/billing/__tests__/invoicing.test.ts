import { describe, it, expect } from "vitest";
import { createInvoiceGenerator } from "../invoicing/generator.js";
import { formatInvoice } from "../invoicing/formatter.js";
import type { BillingPeriod, LineItem } from "../types.js";

describe("invoice generator", () => {
  const period: BillingPeriod = {
    start: "2025-01-01T00:00:00.000Z",
    end: "2025-01-31T23:59:59.999Z",
  };

  let idCounter = 0;
  const generator = createInvoiceGenerator({
    currency: "usd",
    idGenerator: () => `inv-${++idCounter}`,
  });

  it("generates an invoice from line items", () => {
    const lineItems: LineItem[] = [
      {
        description: "API calls — 1000 units",
        metric: "api_calls",
        quantity: 1000,
        unitPrice: 1,
        amount: 1000,
      },
      {
        description: "Tokens used — 5000 units",
        metric: "tokens_used",
        quantity: 5000,
        unitPrice: 2,
        amount: 10000,
      },
    ];

    const invoice = generator.generate("cus-1", period, lineItems);

    expect(invoice.id).toBeDefined();
    expect(invoice.customerId).toBe("cus-1");
    expect(invoice.periodStart).toBe(period.start);
    expect(invoice.periodEnd).toBe(period.end);
    expect(invoice.lineItems).toHaveLength(2);
    expect(invoice.totalAmount).toBe(11000);
    expect(invoice.currency).toBe("usd");
    expect(invoice.status).toBe("draft");
    expect(invoice.createdAt).toBeDefined();
  });

  it("generates an invoice with zero total for empty line items", () => {
    const invoice = generator.generate("cus-1", period, []);

    expect(invoice.totalAmount).toBe(0);
    expect(invoice.lineItems).toHaveLength(0);
  });

  it("sums line item amounts correctly", () => {
    const lineItems: LineItem[] = [
      { description: "A", metric: "a", quantity: 1, unitPrice: 100, amount: 100 },
      { description: "B", metric: "b", quantity: 1, unitPrice: 200, amount: 200 },
      { description: "C", metric: "c", quantity: 1, unitPrice: 300, amount: 300 },
    ];

    const invoice = generator.generate("cus-1", period, lineItems);

    expect(invoice.totalAmount).toBe(600);
  });
});

describe("invoice formatter", () => {
  const sampleInvoice = {
    id: "inv-test-1",
    customerId: "cus-1",
    periodStart: "2025-01-01T00:00:00.000Z",
    periodEnd: "2025-01-31T23:59:59.999Z",
    lineItems: [
      {
        description: "API calls — 1000 units",
        metric: "api_calls",
        quantity: 1000,
        unitPrice: 1,
        amount: 1000,
      },
    ],
    totalAmount: 1000,
    currency: "usd" as const,
    status: "draft" as const,
    createdAt: "2025-02-01T00:00:00.000Z",
  };

  it("formats as JSON", () => {
    const output = formatInvoice(sampleInvoice, "json");
    const parsed = JSON.parse(output);

    expect(parsed.id).toBe("inv-test-1");
    expect(parsed.totalAmount).toBe(1000);
  });

  it("formats as markdown with line items table", () => {
    const output = formatInvoice(sampleInvoice, "markdown");

    expect(output).toContain("# Invoice inv-test-1");
    expect(output).toContain("**Customer:** cus-1");
    expect(output).toContain("| Description |");
    expect(output).toContain("API calls");
    expect(output).toContain("**Total:**");
  });

  it("throws on unsupported format", () => {
    expect(() =>
      formatInvoice(sampleInvoice, "xml" as "json"),
    ).toThrow("Unsupported invoice format");
  });
});
