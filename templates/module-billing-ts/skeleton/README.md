# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createBillingService, isEntitled, type SubscriptionStatus } from "./billing/index.js";

const billing = await createBillingService({
  provider: "__PAYMENT_PROVIDER__",
  currency: "usd",
  pricingRules: [
    { metric: "api_calls", model: "per_unit", unitPrice: 1 },
    { metric: "storage_gb", model: "tiered", tiers: [
      { upTo: 10, unitPrice: 0, label: "free" },
      { upTo: 100, unitPrice: 50, label: "standard" },
      { upTo: Infinity, unitPrice: 25, label: "bulk" },
    ]},
  ],
  stripe: { secretKey: process.env.STRIPE_SECRET_KEY },
});

// Customers and subscriptions
const customer = await billing.createCustomer("ada@example.com", "Ada");
const subscription = await billing.createSubscription(customer.id, "price_pro");
const hasAccess = isEntitled(subscription.status);

// Record usage
billing.recordUsage(customer.id, "api_calls", 100, { endpoint: "/v1/chat" });
billing.recordUsage(customer.id, "storage_gb", 50);

// Generate and charge an invoice
const period = { start: "2025-01-01T00:00:00Z", end: "2025-01-31T23:59:59Z" };
const invoice = billing.generateInvoice(customer.id, period);
const result = await billing.chargeInvoice(invoice, { signal: AbortSignal.timeout(60_000) });
const invoices = await billing.listInvoices(customer.id);

// Bill usage recorded after the period was charged
billing.recordUsage(customer.id, "api_calls", 25);
const late = billing.generateInvoice(customer.id, period, { billed: [invoice] });
if (late.totalAmount > 0) await billing.chargeInvoice(late);

// Handle webhooks
billing.onWebhook("invoice.paid", async (event) => {
  console.log("Invoice paid:", event.id, event.payload);
});
billing.onWebhook("customer.subscription.updated", async (event) => {
  const sub = event.payload as { id: string; status: SubscriptionStatus };
  await setAccess(sub.id, isEntitled(sub.status));
});

const handled = await billing.handleWebhook(rawBody, signatureHeader);
const status = handled.ok ? 200 : handled.reason === "unverified" ? 400 : 500;

// Cleanup
await billing.close();
```

`provider` may be omitted: the service then starts `DEFAULT_PROVIDER` from
`src/billing/config.ts`, which is `__PAYMENT_PROVIDER__` — the provider this
project was scaffolded with.

## Providers

| Provider | Backend | Use Case |
|----------|---------|----------|
| `stripe` | Stripe API | Production payments |
| `mock` | In-memory arrays | Development, testing |

### Stripe

Requires a Stripe secret key. Set `STRIPE_SECRET_KEY` env var or pass in config:

```typescript
const billing = await createBillingService({
  provider: "stripe",
  stripe: {
    secretKey: "sk_test_...",
    webhookSecret: "whsec_...",
    timeoutMs: 20_000,     // per attempt
    maxNetworkRetries: 2,  // after a connection error, 409, 5xx, or Stripe-Should-Retry: true
    chargeLeadMs: 0,       // how far ahead of a period an invoice may be charged
  },
});
```

`timeoutMs`, `maxNetworkRetries` and `chargeLeadMs` default to the
`DEFAULT_STRIPE_*` constants in `src/billing/providers/stripe-config.ts`, which
also holds the `StripeConfig` type and its validation.

`stripe.httpClient` replaces the SDK's transport — `Stripe.createFetchHttpClient()`
on a runtime without `node:http`, or a client over a fake `fetch` in tests. The
SDK calls its `getClientName()` and `makeRequest()`, and the config is refused
without both.

`stripe.chargeLeadMs` is 0 for billing in arrears. A service that bills in
advance sets it to the furthest ahead of a period it charges; see
[Where a charge looks](#where-a-charge-looks).

### Mock

No configuration needed. Returns deterministic IDs (`mock-cus-1`, `mock-sub-1`, etc.).

```typescript
const billing = await createBillingService({ provider: "mock" });
```

The mock accepts any webhook signature and reports every charge as paid, so it
starts only when the config names it. A config that omits `provider` never
lands on the mock, even in a project scaffolded with `mock` as its default.

## Custom Providers

Implement the `PaymentProvider` interface and register a factory for it under
the name `provider` selects it by. The registry calls the factory for a fresh
instance each time a billing service starts. This one wraps the Stripe
provider and logs each charge's result:

```typescript
import { getProvider, type PaymentProvider, registerProvider } from "./billing/providers/index.js";

/**
 * A provider that charges through `inner` and hands each charge's result to
 * `audit`. It carries every method a PaymentProvider has; one for another
 * gateway fills each with calls to that gateway's API.
 */
function createAuditedProvider(
  inner: PaymentProvider,
  audit: (entry: Record<string, unknown>) => void,
): PaymentProvider {
  return {
    name: `audited-${inner.name}`,
    init: (config) => inner.init(config),
    createCustomer: (email, name, metadata) => inner.createCustomer(email, name, metadata),
    createSubscription: (customerId, planId) => inner.createSubscription(customerId, planId),
    async chargeInvoice(invoice, options) {
      const result = await inner.chargeInvoice(invoice, options);
      audit({ invoiceId: invoice.id, ...result });
      return result;
    },
    handleWebhook: (payload, signature) => inner.handleWebhook(payload, signature),
    listInvoices: (customerId) => inner.listInvoices(customerId),
    close: () => inner.close(),
  };
}

registerProvider("audited-stripe", () =>
  createAuditedProvider(getProvider("stripe"), (entry) => console.log(JSON.stringify(entry))),
);
```

`createBillingService({ provider: "audited-stripe" })` then starts it. This
block is `src/billing/__tests__/readme-custom-provider.ts`, which
`npm run typecheck` compiles; `src/billing/__tests__/readme.test.ts` runs it
and fails when this block and that file differ.

A provider for another gateway meets the contract `PaymentProvider` sets out
in `src/billing/providers/types.ts`:

- `chargeInvoice` resumes the first charge when an `invoice.id` is charged
  again, reports `invoice_content_changed` when the first charge issued other
  content, reports as `collected` only what its own payment request collected,
  and stops once `options?.signal` aborts.
- `handleWebhook` throws unless the signature verifies against the raw body.

## Webhooks

`billing.handleWebhook(rawBody, signature)` verifies the request with the
provider the service initialized, then dispatches the event to the handler
registered for its type. It never throws; it returns a `WebhookResult`:

| Result | Meaning | Answer the request with |
|--------|---------|-------------------------|
| `{ ok: true, event }` | Verified, and its handler, if any, finished | 2xx |
| `{ ok: false, reason: "unverified", error }` | Failed verification; reached no handler | 4xx |
| `{ ok: false, reason: "handler_failed", event, error }` | Verified, and its handler threw | 5xx, so Stripe delivers it again |

- **Raw body.** Pass the request body exactly as received. A body that was
  parsed and re-serialized no longer matches its signature.
- **Event names are Stripe's own** — `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, and the rest of Stripe's event catalog.
- **Dedupe on `event.id`.** Stripe delivers an event at least once; a handler
  that must act once records the IDs it has handled.
- **Subscription status.** On `customer.subscription.*` events the payload's
  `status` is normalized the same way `createSubscription` normalizes it: a
  status this module does not recognize reads as `incomplete`. Gate access with
  `isEntitled(status)`, which holds for `active` and `trialing` only.

## Charges

`billing.chargeInvoice(invoice, options)` returns a `ChargeResult`:

- `{ ok: true, externalId, collected }` — the invoice is paid. `collected` is
  what this call's own payment request collected: 0 when the charge resumed an
  invoice an earlier charge had paid, and 0 when Stripe answered its payment
  from an earlier request with the same idempotency key. Of two charges that
  race past the lookup and pay one invoice, only one reports the money, so
  `billing_payment_total` counts each payment at most once. A payment whose
  answer was lost is counted by no call: the request that retries it is
  answered from the stored payment.
- `{ ok: false, code, error, externalId? }` — the invoice is not paid, and
  `code` says why:

| `code` | Meaning | What to do |
|--------|---------|------------|
| `declined` | The payment method was refused | Stripe keeps the invoice open and retries it; follow `invoice.paid` and `invoice.payment_failed` |
| `payment_pending` | The payment was accepted and has not settled, as with a bank debit | Wait for `invoice.paid` or `invoice.payment_failed` |
| `unavailable` | Stripe could not be reached or failed, or the circuit breaker is open | Charge again later; the charge resumes |
| `rejected` | Stripe refused the request: an invalid request, a rejected key, a rate limit, an idempotency conflict | Read `error` and fix its cause; charging again then resumes from what the charge wrote. A rate limit clears by itself |
| `aborted` | `options.signal` stopped the charge | Charge again; the charge resumes |
| `invoice_closed` | The invoice an earlier charge of this ID left is void or uncollectible | Nothing further is charged under this ID |
| `lookup_exhausted` | A read stopped at `MAX_LISTED`. Without `externalId`, the lookup read that many of the customer's invoices in its window without finding an earlier charge of this ID, so it cannot tell whether there was one. With `externalId`, it found that Stripe invoice and could not read all of its lines to compare them. Nothing was written | Without `externalId`: search Stripe for an invoice with metadata `invoice_id` set to this ID. If there is one, reconcile it; if not, charge again with `{ assumeUncharged: true }`. With `externalId`: compare that Stripe invoice with this invoice by hand |
| `before_charge_window` | The invoice's period starts more than `stripe.chargeLeadMs` from now. Nothing was written | Charge it once the window opens, or raise `stripe.chargeLeadMs` to how far ahead of a period you bill |
| `invoice_content_changed` | An earlier charge of this ID issued an invoice that bills other content; `billedAmount` is what it bills | Generate with `{ billed }` and charge that; see below |

The invoice ID derives from the customer, the period, and the invoice's
sequence within the period, not from what the invoice bills. Usage recorded
after a period was charged regenerates the same ID with more on it, and
charging that reports `invoice_content_changed` rather than reporting paid what
Stripe billed for less. `generateInvoice(customerId, period, { billed })`,
given the invoices already charged for the period, bills what they leave out
under the next sequence:

```typescript
const first = billing.generateInvoice(customerId, period);
await billing.chargeInvoice(first);
// ...usage recorded after the charge...
const late = billing.generateInvoice(customerId, period, { billed: [first] });
if (late.totalAmount > 0) await billing.chargeInvoice(late);
```

Each metric's line bills its whole amount less what the billed invoices bill
for it, so tiered usage is priced at the tiers the period's whole quantity
reaches. Generating throws when `billed` is not the period's invoices from
sequence 0, is in another currency, or bills a metric for more than its usage
comes to.

### How a charge resumes

A charge first looks for the Stripe invoice an earlier charge of the same
invoice ID wrote, then acts on what it finds:

| Earlier Stripe invoice | What the charge does | Result |
|------------------------|----------------------|--------|
| None, with the window read to its end | Creates a draft, adds the lines, finalizes it, pays it | Paid, or the payment's failure |
| None, with the lookup stopped at `MAX_LISTED` | Nothing, unless `assumeUncharged` is set | `lookup_exhausted` |
| Any, carrying more than `MAX_LISTED` lines | Nothing | `lookup_exhausted`, with its `externalId` |
| Draft created for this content | Adds the lines it lacks, finalizes it, pays it | Paid, or the payment's failure |
| Draft created for other content, or carrying a line this content does not have | Deletes its lines, creates a replacement draft, deletes the emptied draft, finishes the replacement | Paid, or the payment's failure |
| Open, billing this content | Pays it | Paid, or the payment's failure |
| Paid, billing this content | Nothing | Paid, `collected: 0` |
| Open or paid, billing other content | Nothing | `invoice_content_changed` |
| Void or uncollectible | Nothing | `invoice_closed` |

What a charge writes on Stripe, and reads back to decide:

| Where | Metadata key | Holds |
|-------|--------------|-------|
| Invoice | `invoice_id` | The ID the invoice was charged under |
| Invoice | `invoice_content` | A digest of the currency and of each line's description, metric, quantity and amount, in order |
| Invoice item | `invoice_line` | The line's index in `Invoice.lineItems` |
| Invoice item | `metric` | The line's metric |
| Invoice item | `quantity` | The line's quantity; an item priced by `amount` has a Stripe quantity of 1 |

"Billing this content" means the same currency and, at each `invoice_line`
index, the same amount, `metric` and `quantity`, with no other line.

Idempotency keys, each prefixed `billing-invoice:<invoice ID>:`:

| Step | Key suffix |
|------|------------|
| Create a draft | `create`, or `create-replacing-<draft>` for a replacement |
| Add line `n` | `<draft>:item-<n>` |
| Finalize | `<draft>:finalize` |
| Pay | `<invoice>:pay` |

Deleting a stale draft's items and the draft itself carries no key.

#### Why it works this way

- **List, not search.** The lookup reads the customer's invoices through
  `invoices.list`, newest first, a page of 100 per call. Stripe documents its
  search index as trailing writes by up to a minute, and a retry after a
  timeout looks for a write seconds old.
- **Keys make a race converge.** Every POST is keyed by the invoice ID and its
  step, and every write to a Stripe invoice by that invoice too. Two charges of
  the same content that both miss the lookup send the same requests under the
  same keys. Stripe applies each once and answers the other with the stored
  response, marked `Idempotent-Replayed`; a request that arrives while its twin
  is still running gets a 409, which the SDK retries while `maxNetworkRetries`
  allows. There is one invoice and one payment, and only the charge whose
  payment Stripe applied reports it collected.
- **The create key names the content.** The create request carries the content
  digest, so a create of the same ID for other content reuses a key with other
  parameters, and Stripe refuses it as an idempotency conflict rather than
  handing back the earlier charge's invoice.
- **A declined payment stays declined while Stripe holds its key**, at least 24
  hours: Stripe replays the stored decline. The invoice stays open and Stripe's
  automatic collection retries it, reporting through `invoice.paid` and
  `invoice.payment_failed`.
- **Automatic advancement is off until every line is on.** Stripe finalizes a
  draft with it on about an hour after creating it, which would finalize a
  draft a charge left short.
- **A DELETE needs no key.** Stripe documents DELETE as idempotent by itself. A
  retried DELETE that Stripe already applied finds nothing left and answers
  404, which the charge reads as done.

### Where a charge looks

The lookup reads the customer's Stripe invoices created since the period's
start, less `stripe.chargeLeadMs` and an hour for clock skew, and stops after
`MAX_LISTED` of them (`src/billing/providers/stripe.ts`). The window hangs from
the period, not from when the invoice was generated, because a regenerated
invoice carries a later creation time. The same lead bounds when a charge may
run: one more than `chargeLeadMs` before its period starts is refused as
`before_charge_window`, so every charge of an ID lands inside the window every
later charge of it reads. The lines of the earlier charge's invoice, once it is
found, are read to the same `MAX_LISTED` bound, and an invoice with more lines
than that is reported as `lookup_exhausted` rather than compared in part.

A charge can still be repeated in these cases:

- **The earlier charge's `invoice_id` metadata was changed in Stripe.** The
  lookup recognizes a charge by that metadata alone.
- **`assumeUncharged` was set while an earlier charge lay past `MAX_LISTED`.**
  That option is the caller's word that none does.
- **Two charges of one ID with different content run at once.** They are not
  reconciled against each other: one can replace a draft the other is still
  finishing. Run a period's charges from one worker.

### Charge deadline

`chargeInvoice(invoice, { signal })` checks the signal before every Stripe call
and reports `aborted` once it has. The SDK takes no signal, so a call already
in flight runs on: it can take `maxNetworkRetries + 1` attempts of `timeoutMs`
each (two when `maxNetworkRetries` is 0 and the first connection closes), with
the SDK's backoff of up to 5 seconds before each retry. A charge therefore
settles at most that long after its signal aborts. Charging the invoice again
resumes it.

## Architecture

- **Billing service facade** -- `createBillingService()` returns a unified interface wrapping metering, invoicing, customers, subscriptions, payment, and webhook handling. Every provider call goes through the one provider instance the service initialized. `chargeInvoice` and `handleWebhook` return results; `createCustomer`, `createSubscription` and `listInvoices` reject with the provider's error.
- **Usage metering** -- records events with customerId, metric name, quantity, and tags. The aggregator groups by metric, applies pricing rules (per-unit, tiered, flat), and produces line items.
- **Invoice generation** -- takes aggregated line items and produces a structured Invoice with totals, currency, and status tracking. Supports JSON and Markdown export; Markdown formats amounts in each currency's own minor unit (cents for USD, whole yen for JPY). The invoice ID derives from the customer, billing period and sequence (`deriveInvoiceId`, or `idGenerator` in the config), so generating a period again yields the same ID.
- **Payment provider registry with self-registration** -- each provider module (stripe, mock) calls `registerProvider(name, factory)` at import time. Adding a custom provider is one `registerProvider()` call.
- **Stripe provider** -- lazy SDK initialization with an explicit request timeout and retry count; webhook signature verification via `stripe.webhooks.constructEvent()`; invoice listing that pages through every invoice and every line, bounded by `MAX_LISTED` in `providers/stripe.ts`. An invoice `chargeInvoice` wrote lists under the ID it was charged under, with its Stripe ID as `externalId`. Charging is set out under [Charges](#charges).
- **Circuit breaker** -- three-state (closed, open, half-open) protection on Stripe calls. Only an outage counts toward opening it — a connection failure, a timeout, or a 5xx. A 4xx such as a declined card is Stripe answering, so one customer's decline never blocks another's charge.
- **Zod input validation** -- `createBillingService()` validates config against a schema before initializing the provider.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message.

## Production Readiness

- [ ] Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` environment variables
- [ ] Configure pricing rules for all tracked metrics
- [ ] Wire up a webhook endpoint that hands `handleWebhook` the raw request body and answers by `WebhookResult`
- [ ] Dedupe webhook handlers on `event.id`
- [ ] Gate feature access on `isEntitled(subscription.status)`
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor `billing_payment_total` (amounts collected, by `currency`), `billing_charge_calls` (charge calls, by `result`: `paid` or the failure code) and `billing_invoice_generated`
- [ ] Persist usage records to a database (in-memory tracker is ephemeral)
- [ ] Persist each invoice you charge: `generateInvoice(customerId, period, { billed })` takes the period's charged invoices to bill late usage
- [ ] Handle `invoice_content_changed` by charging the invoice `{ billed }` generates, and `lookup_exhausted` by checking Stripe before `assumeUncharged`
- [ ] Billing in advance: set `stripe.chargeLeadMs` to how far ahead of a period you charge

## Development

```bash
npm install
npm run dev        # watch mode
npm run typecheck  # type-check sources and tests
npm run build      # compile TypeScript (tests excluded)
npm test           # run tests with coverage
npm start          # run compiled output
```

## License

Apache-2.0
