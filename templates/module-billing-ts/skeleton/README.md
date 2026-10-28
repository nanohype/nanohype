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

// Handle webhooks
billing.onWebhook("invoice.paid", async (event) => {
  console.log("Invoice paid:", event.id, event.payload);
});
billing.onWebhook("customer.subscription.updated", async (event) => {
  const sub = event.payload as { id: string; status: SubscriptionStatus };
  await setAccess(sub.id, isEntitled(sub.status));
});

await billing.handleWebhook(rawBody, signatureHeader);

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
  },
});
```

Both default to the `DEFAULT_STRIPE_*` constants in `src/billing/config.ts`.

`stripe.httpClient` replaces the SDK's transport — `Stripe.createFetchHttpClient()`
on a runtime without `node:http`, or a client over a fake `fetch` in tests. The
SDK calls its `getClientName()` and `makeRequest()`, and the config is refused
without both.

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
instance each time a billing service starts.

```typescript
import { registerProvider } from "./billing/providers/index.js";
import type { PaymentProvider } from "./billing/providers/index.js";

function createMyGateway(): PaymentProvider {
  return {
    name: "my-gateway",
    async init(config) { /* ... */ },
    async createCustomer(email, name, metadata) { /* ... */ },
    async createSubscription(customerId, planId) { /* ... */ },
    async chargeInvoice(invoice, options) { /* charging an invoice.id again resumes the first charge, or reports invoice_content_changed when it issued other content; stop once options?.signal aborts */ },
    async handleWebhook(payload, signature) { /* throw unless the signature verifies */ },
    async listInvoices(customerId) { /* ... */ },
    async close() { /* ... */ },
  };
}

registerProvider("my-gateway", createMyGateway);

const billing = await createBillingService({ provider: "my-gateway" });
```

## Webhooks

`billing.handleWebhook(rawBody, signature)` verifies the request with the
provider the service initialized, then dispatches the event to the handler
registered for its type. A request that fails verification reaches no handler
and returns `{ ok: false, error }`.

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
  what this call collected, so a charge that resumes an invoice an earlier
  charge already paid reports 0, and `billing_payment_total` counts a payment
  once when one call made it. A payment whose answer was lost is counted by no
  call, and one that two charges racing past the lookup both received is
  counted by each.
- `{ ok: false, code, error, externalId? }` — the invoice is not paid, and
  `code` says why:

| `code` | Meaning | What to do |
|--------|---------|------------|
| `declined` | The payment method was refused | Stripe keeps the invoice open and retries it; follow `invoice.paid` and `invoice.payment_failed` |
| `payment_pending` | The payment was accepted and has not settled, as with a bank debit | Wait for `invoice.paid` or `invoice.payment_failed` |
| `unavailable` | Stripe could not be reached or failed, or the circuit breaker is open | Charge again later; the charge resumes |
| `rejected` | Stripe refused the request: an invalid request, a rejected key, a rate limit, an idempotency conflict | Read `error` |
| `aborted` | `options.signal` stopped the charge | Charge again; the charge resumes |
| `invoice_closed` | The invoice an earlier charge of this ID left is void or uncollectible | Nothing further is charged under this ID |
| `invoice_content_changed` | An earlier charge of this ID issued an invoice that bills other content; `billedAmount` is what it bills | Bill what changed under an invoice with its own ID |

The invoice ID derives from the customer and period, not from what the invoice
bills. Usage recorded after a period was charged regenerates the same ID with
more on it, and charging that reports `invoice_content_changed` rather than
reporting paid what Stripe billed for less.

## Architecture

- **Billing service facade** -- `createBillingService()` returns a unified interface wrapping metering, invoicing, customers, subscriptions, payment, and webhook handling. Every provider call goes through the one provider instance the service initialized.
- **Usage metering** -- records events with customerId, metric name, quantity, and tags. The aggregator groups by metric, applies pricing rules (per-unit, tiered, flat), and produces line items.
- **Invoice generation** -- takes aggregated line items and produces a structured Invoice with totals, currency, and status tracking. Supports JSON and Markdown export; Markdown formats amounts in each currency's own minor unit (cents for USD, whole yen for JPY). The invoice ID derives from the customer and billing period (`deriveInvoiceId`), so generating a period again yields the same ID.
- **Payment provider registry with self-registration** -- each provider module (stripe, mock) calls `registerProvider(name, factory)` at import time. Adding a custom provider is one `registerProvider()` call.
- **Stripe provider** -- lazy SDK initialization with an explicit request timeout and retry count; webhook signature verification via `stripe.webhooks.constructEvent()`; invoice listing that pages through every invoice and every line, bounded by `MAX_LISTED` in `providers/stripe.ts`. An invoice `chargeInvoice` wrote lists under the ID it was charged under, with its Stripe ID as `externalId`.
- **Resumable charges** -- `chargeInvoice` first looks for the Stripe invoice an earlier charge of the same invoice ID wrote, by the `invoice_id` metadata on the customer's invoices created since an hour before the invoice's period started, or before it was generated if that came first. They are read newest first through `invoices.list`, a page of 100 per call, so the first charge of an invoice costs one list call unless the customer has more invoices than that in the window; Stripe documents its search index as trailing writes, and a retry after a timeout looks for a write seconds old. The charge resumes from what it finds, after checking it line for line — amount, metric (`metric` metadata) and quantity (`quantity` metadata) at each index (`invoice_line` metadata), and the currency. An open invoice that matches is paid and a paid one is reported paid with `collected: 0`; one that does not match is reported as `invoice_content_changed` and left as it is. A draft created for this content (its `invoice_content` metadata) gets the lines it is missing and is finalized. A draft created for other content has billed nobody, so its lines are deleted and a new draft replaces it. A void or uncollectible invoice is reported as `invoice_closed`. Only when there is none is a Stripe invoice created, with automatic advancement off until its lines are all on, so Stripe never finalizes a draft a charge left short.
- **Idempotency keys** -- every POST is keyed by the invoice ID and its step, and every write to a Stripe invoice by that invoice too, so two charges of the same content racing past the lookup still create one invoice and pay it once, though each reports the payment as its own. Stripe keeps a key for at least 24 hours and replays the stored outcome, a decline included; a declined invoice stays open and Stripe's automatic collection retries it, reporting through `invoice.paid` and `invoice.payment_failed`. The create request carries the content digest, so a create of the same ID for other content is refused by Stripe as an idempotency conflict rather than handed the earlier charge's invoice.
- **One charge of an invoice ID at a time** -- two concurrent charges of one ID with different content are not reconciled against each other: one can replace a draft the other is still finishing. Run a period's charge from one worker.
- **Where a second charge can still happen** -- the lookup reads the customer's newest `MAX_LISTED` Stripe invoices in its window. An earlier charge outside it, replayed after Stripe has dropped its idempotency keys, is not found and is charged again: one older than the newest `MAX_LISTED`, or one made more than an hour before the period started and replayed by an invoice regenerated since. The same holds for an earlier charge whose `invoice_id` metadata was changed in Stripe.
- **Charge deadline** -- `chargeInvoice(invoice, { signal })` checks the signal before every Stripe call and reports `aborted` once it has. The SDK takes no signal, so a call already in flight runs on: it can take `maxNetworkRetries + 1` attempts of `timeoutMs` each (two when `maxNetworkRetries` is 0 and the first connection closes), with the SDK's backoff of up to 5 seconds before each retry. A charge therefore settles at most that long after its signal aborts. Charging the invoice again resumes it.
- **Circuit breaker** -- three-state (closed, open, half-open) protection on Stripe calls. Only an outage counts toward opening it — a connection failure, a timeout, or a 5xx. A 4xx such as a declined card is Stripe answering, so one customer's decline never blocks another's charge.
- **Zod input validation** -- `createBillingService()` validates config against a schema before initializing the provider.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message.

## Production Readiness

- [ ] Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` environment variables
- [ ] Configure pricing rules for all tracked metrics
- [ ] Wire up a webhook endpoint that hands `handleWebhook` the raw request body
- [ ] Dedupe webhook handlers on `event.id`
- [ ] Gate feature access on `isEntitled(subscription.status)`
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor billing_payment_total (collected amounts, and failed charges by `code`) and billing_invoice_generated
- [ ] Persist usage records to a database (in-memory tracker is ephemeral)
- [ ] Bill each customer once per billing period, or give a second invoice for the same period its own ID: the default ID derives from the customer and period, and charging an ID again resumes the first charge. `createInvoiceGenerator({ idGenerator })` builds invoices under IDs of your choosing
- [ ] Handle `invoice_content_changed`: usage recorded after a period was charged is billed under an invoice with its own ID

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
