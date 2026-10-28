import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBillingService, type Invoice } from "../index.js";
import { fakeStripeAccount } from "./fake-stripe.js";

// ── README Custom-Provider Example ─────────────────────────────────
//
// The README's custom-provider example is readme-custom-provider.ts, which
// `npm run typecheck` compiles with the rest of the suite. These tests hold
// the README's block to that file and run it as a billing service's
// provider. The file imports from `../`, where the README, written from
// `src/`, imports from `./billing/`; that prefix is the only difference.
//

/** The opening of a specifier in the example file, and in the README. */
const FILE_SPECIFIER = '"../';
const README_SPECIFIER = '"./billing/';

afterEach(() => {
  vi.restoreAllMocks();
});

describe("README custom-provider example", () => {
  it("is the file this suite compiles, word for word", () => {
    const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
    const example = readFileSync(new URL("./readme-custom-provider.ts", import.meta.url), "utf8");

    const block = /## Custom Providers\n[\s\S]*?```typescript\n([\s\S]*?)```/.exec(readme)?.[1];

    expect(block).toBe(example.replaceAll(FILE_SPECIFIER, README_SPECIFIER));
  });

  it("starts as a billing service's provider and audits each charge", async () => {
    await import("./readme-custom-provider.js");
    const audit = vi.spyOn(console, "log").mockImplementation(() => {});
    const account = fakeStripeAccount();
    const billing = await createBillingService({
      provider: "audited-stripe",
      stripe: {
        secretKey: "sk_test_nanohypeReadmeSecretKey",
        maxNetworkRetries: 0,
        httpClient: account.httpClient,
      },
    });
    const invoice: Invoice = {
      id: "inv-readme",
      customerId: "cus_readme",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-02-01T00:00:00.000Z",
      lineItems: [
        { description: "API calls", metric: "api_calls", quantity: 2, unitPrice: 5, amount: 10 },
      ],
      totalAmount: 10,
      currency: "usd",
      status: "draft",
      createdAt: "2026-02-01T00:00:00.000Z",
    };

    const result = await billing.chargeInvoice(invoice);
    await billing.close();

    expect(billing.provider).toBe("audited-stripe");
    expect(result).toEqual({ ok: true, externalId: "in_1", collected: 10 });
    expect(audit).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ invoiceId: "inv-readme", ...result }),
    );
  });
});
