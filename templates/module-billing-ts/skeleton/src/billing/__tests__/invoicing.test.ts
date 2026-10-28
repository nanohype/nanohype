import { describe, expect, it } from "vitest";
import { formatInvoice } from "../invoicing/formatter.js";
import { createInvoiceGenerator, deriveInvoiceId } from "../invoicing/generator.js";
import { createUsageAggregator } from "../metering/aggregator.js";
import type { BillingPeriod, Invoice, LineItem, UsageRecord } from "../types.js";

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

  it("hands an injected ID generator the customer, the period and sequence 0", () => {
    const seen: unknown[] = [];
    const injected = createInvoiceGenerator({
      idGenerator: (customerId, billing, sequence) => {
        seen.push([customerId, billing, sequence]);
        return "inv-injected";
      },
    });

    const invoice = injected.generate("cus-1", period, []);

    expect(invoice.id).toBe("inv-injected");
    expect(seen).toEqual([["cus-1", period, 0]]);
  });
});

describe("invoice IDs", () => {
  const january = { start: "2025-01-01T00:00:00.000Z", end: "2025-01-31T23:59:59.999Z" };
  const february = { start: "2025-02-01T00:00:00.000Z", end: "2025-02-28T23:59:59.999Z" };

  it("gives an invoice regenerated for the same customer and period the same ID", () => {
    const generator = createInvoiceGenerator();

    const first = generator.generate("cus-1", january, []);
    const again = createInvoiceGenerator().generate("cus-1", { ...january }, []);

    expect(again.id).toBe(first.id);
    expect(first.id).toBe(deriveInvoiceId("cus-1", january));
    expect(first.id).toMatch(/^inv_[0-9a-f]{32}$/);
  });

  it("gives a different customer or a different period a different ID", () => {
    const ids = new Set([
      deriveInvoiceId("cus-1", january),
      deriveInvoiceId("cus-2", january),
      deriveInvoiceId("cus-1", february),
      deriveInvoiceId("cus-1", { start: january.start, end: february.end }),
    ]);

    expect(ids.size).toBe(4);
  });

  it("reads two spellings of the same instants as one period", () => {
    expect(
      deriveInvoiceId("cus-1", { start: "2025-01-01T00:00:00Z", end: "2025-02-01T00:00:00Z" }),
    ).toBe(
      deriveInvoiceId("cus-1", {
        start: "2025-01-01T00:00:00.000Z",
        end: "2025-02-01T00:00:00.000Z",
      }),
    );
  });

  it("keeps period bounds that do not parse apart from one another", () => {
    const unparsed = (start: string) => deriveInvoiceId("cus-1", { start, end: january.end });

    expect(unparsed("first of the month")).toBe(unparsed("first of the month"));
    expect(unparsed("first of the month")).not.toBe(unparsed("start of the quarter"));
  });

  it("gives each sequence within one period its own ID, the first being sequence 0", () => {
    const ids = new Set([0, 1, 2].map((sequence) => deriveInvoiceId("cus-1", january, sequence)));

    expect(ids.size).toBe(3);
    expect(deriveInvoiceId("cus-1", january)).toBe(deriveInvoiceId("cus-1", january, 0));
  });

  it("keeps a customer ID apart from the period it is followed by", () => {
    // A separator in the customer ID cannot make two different pairs of
    // customer and period read as one.
    expect(deriveInvoiceId('cus-1","x', january)).not.toBe(deriveInvoiceId("cus-1", january));
  });
});

describe("invoicing what earlier invoices left out", () => {
  const period: BillingPeriod = {
    start: "2025-01-01T00:00:00.000Z",
    end: "2025-02-01T00:00:00.000Z",
  };
  const aggregator = createUsageAggregator({
    pricingRules: [
      { metric: "api_calls", model: "per_unit", unitPrice: 5 },
      { metric: "storage_gb", model: "flat", flatAmount: 300 },
      {
        metric: "tokens",
        model: "tiered",
        tiers: [
          { upTo: 10, unitPrice: 0 },
          { upTo: 100, unitPrice: 4 },
          { upTo: Infinity, unitPrice: 1 },
        ],
      },
    ],
  });
  let recorded = 0;
  const usage = (quantities: Record<string, number>): LineItem[] => {
    const records: UsageRecord[] = Object.entries(quantities).map(([metric, quantity]) => ({
      id: `rec-${++recorded}`,
      customerId: "cus-1",
      metric,
      quantity,
      timestamp: period.start,
      tags: {},
    }));
    return aggregator.aggregate(records, "cus-1", period).lineItems;
  };
  const generator = createInvoiceGenerator({ currency: "usd" });

  it("bills each metric past what earlier invoices billed, under the next sequence", () => {
    const first = generator.generate("cus-1", period, usage({ api_calls: 10, storage_gb: 1 }));

    const rest = generator.generate(
      "cus-1",
      period,
      usage({ api_calls: 100, storage_gb: 1, tokens: 5 }),
      { billed: [first] },
    );

    expect(rest.id).toBe(deriveInvoiceId("cus-1", period, 1));
    expect(rest.lineItems).toEqual([
      {
        description: "api_calls — 100 units @ 5/unit (90 not yet billed)",
        metric: "api_calls",
        quantity: 90,
        unitPrice: 5,
        amount: 450,
      },
    ]);
    expect(rest.totalAmount).toBe(450);
  });

  it("bills the remainder of tiered usage at the tiers the whole quantity reaches", () => {
    const first = generator.generate("cus-1", period, usage({ tokens: 50 }));

    const rest = generator.generate("cus-1", period, usage({ tokens: 150 }), { billed: [first] });

    // 150 tokens: 10 free, 90 at 4, 50 at 1 = 410; the first invoice billed
    // 50 tokens: 10 free, 40 at 4 = 160.
    expect(first.totalAmount).toBe(160);
    expect(rest.lineItems).toMatchObject([
      { metric: "tokens", quantity: 100, amount: 250, unitPrice: 3, tier: "up to Infinity" },
    ]);
  });

  it("sums several earlier invoices and accepts them in any order", () => {
    const first = generator.generate("cus-1", period, usage({ api_calls: 10 }));
    const second = generator.generate("cus-1", period, usage({ api_calls: 30 }), {
      billed: [first],
    });

    const third = generator.generate("cus-1", period, usage({ api_calls: 31 }), {
      billed: [second, first],
    });

    expect(third.id).toBe(deriveInvoiceId("cus-1", period, 2));
    expect(third.lineItems).toMatchObject([{ quantity: 1, amount: 5 }]);
  });

  it("produces an invoice with no lines when earlier invoices bill everything", () => {
    const lines = usage({ api_calls: 10, storage_gb: 4 });
    const first = generator.generate("cus-1", period, lines);

    const rest = generator.generate("cus-1", period, lines, { billed: [first] });

    expect(rest.lineItems).toEqual([]);
    expect(rest.totalAmount).toBe(0);
  });

  it("reads a line of no quantity as costing nothing per unit", () => {
    const first = generator.generate("cus-1", period, [
      { description: "Setup", metric: "setup", quantity: 1, unitPrice: 0, amount: 100 },
    ]);

    const rest = generator.generate(
      "cus-1",
      period,
      [{ description: "Setup", metric: "setup", quantity: 1, unitPrice: 0, amount: 150 }],
      { billed: [first] },
    );

    expect(rest.lineItems).toMatchObject([{ quantity: 0, unitPrice: 0, amount: 50 }]);
  });

  it.each<[string, { customerId?: string; period?: BillingPeriod; sequence?: number }]>([
    ["another period's invoice", { period: { ...period, end: "2025-03-01T00:00:00.000Z" } }],
    ["another customer's invoice", { customerId: "cus-2" }],
    ["a later sequence with the first missing", { sequence: 1 }],
  ])("refuses %s as billed", (_label, other) => {
    const elsewhere = createInvoiceGenerator({
      idGenerator: (customerId, billing, sequence) =>
        deriveInvoiceId(
          other.customerId ?? customerId,
          other.period ?? billing,
          other.sequence ?? sequence,
        ),
    }).generate("cus-1", period, usage({ api_calls: 1 }));

    expect(() =>
      generator.generate("cus-1", period, usage({ api_calls: 2 }), { billed: [elsewhere] }),
    ).toThrow(/^billed must be the invoices already generated for customer cus-1/);
  });

  it("refuses the same earlier invoice given twice", () => {
    const first = generator.generate("cus-1", period, usage({ api_calls: 1 }));

    expect(() =>
      generator.generate("cus-1", period, usage({ api_calls: 2 }), { billed: [first, first] }),
    ).toThrow(/^billed must be the invoices already generated/);
  });

  it("refuses an earlier invoice in another currency", () => {
    const first = createInvoiceGenerator({ currency: "eur" }).generate(
      "cus-1",
      period,
      usage({ api_calls: 1 }),
    );

    expect(() =>
      generator.generate("cus-1", period, usage({ api_calls: 2 }), { billed: [first] }),
    ).toThrow(`Invoice ${first.id} bills in eur, not usd`);
  });

  it("reads a currency's case as the same currency", () => {
    const first = createInvoiceGenerator({ currency: "USD" }).generate(
      "cus-1",
      period,
      usage({ api_calls: 1 }),
    );

    const rest = generator.generate("cus-1", period, usage({ api_calls: 2 }), { billed: [first] });

    expect(rest.totalAmount).toBe(5);
  });

  it.each<[string, Invoice["lineItems"]]>([
    ["more than its usage comes to", [{ ...line("api_calls"), amount: 60 }]],
    ["a metric with no usage", [{ ...line("tokens"), amount: 1 }]],
  ])("refuses earlier invoices that bill %s", (_label, lineItems) => {
    const first = { ...generator.generate("cus-1", period, []), lineItems };

    expect(() =>
      generator.generate("cus-1", period, usage({ api_calls: 10 }), { billed: [first] }),
    ).toThrow(/^Invoices already billed \d+ for \w+, more than its usage comes to \(\d+\)$/);
  });

  function line(metric: string): LineItem {
    return { description: metric, metric, quantity: 1, unitPrice: 0, amount: 0 };
  }
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
    expect(() => formatInvoice(sampleInvoice, "xml" as "json")).toThrow(
      "Unsupported invoice format",
    );
  });

  // Amounts are held in the currency's smallest unit, and that unit is the
  // currency's own: the line "| … | 1000 |" reads $10.00, ¥1,000, or KWD 1.000.
  function totalLine(currency: string, amount: number): string | undefined {
    const output = formatInvoice(
      {
        ...sampleInvoice,
        currency,
        lineItems: [{ ...sampleInvoice.lineItems[0]!, unitPrice: amount, amount }],
        totalAmount: amount,
      },
      "markdown",
    );
    return output.split("\n").find((line) => line.startsWith("**Total:**"));
  }

  it("formats a two-decimal currency from cents", () => {
    expect(totalLine("usd", 123456)).toBe("**Total:** $1,234.56");
  });

  it("formats a zero-decimal currency without dividing by 100", () => {
    expect(totalLine("jpy", 1000)).toBe("**Total:** ¥1,000");
  });

  it("formats a three-decimal currency from thousandths", () => {
    expect(totalLine("kwd", 1234)).toMatch(/^\*\*Total:\*\* KWD\s1\.234$/);
  });

  it("formats the line items in the invoice's currency too", () => {
    const output = formatInvoice({ ...sampleInvoice, currency: "jpy" }, "markdown");

    expect(output).toContain("| API calls — 1000 units | 1000 | ¥1 | ¥1,000 |");
  });
});
