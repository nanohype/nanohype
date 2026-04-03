# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createBillingService } from "./billing/index.js";

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

// Record usage
billing.recordUsage("cus-1", "api_calls", 100, { endpoint: "/v1/chat" });
billing.recordUsage("cus-1", "storage_gb", 50);

// Generate and charge an invoice
const period = { start: "2025-01-01T00:00:00Z", end: "2025-01-31T23:59:59Z" };
const invoice = billing.generateInvoice("cus-1", period);
const result = await billing.chargeInvoice(invoice);

// Handle webhooks
billing.onWebhook("invoice.paid", async (event) => {
  console.log("Invoice paid:", event.payload);
});

await billing.handleWebhook(rawBody, signatureHeader);

// Cleanup
await billing.close();
```

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
  },
});
```

### Mock

No configuration needed. Returns deterministic IDs (`mock-cus-1`, `mock-sub-1`, etc.).

```typescript
const billing = await createBillingService({ provider: "mock" });
```

## Custom Providers

Implement the `PaymentProvider` interface and register it:

```typescript
import { registerProvider } from "./billing/providers/index.js";
import type { PaymentProvider } from "./billing/providers/index.js";

const myProvider: PaymentProvider = {
  name: "my-gateway",
  async init(config) { /* ... */ },
  async createCustomer(email, name) { /* ... */ },
  async createSubscription(customerId, planId) { /* ... */ },
  async chargeInvoice(invoice) { /* ... */ },
  async handleWebhook(payload, signature) { /* ... */ },
  async listInvoices(customerId) { /* ... */ },
  async close() { /* ... */ },
};

registerProvider(myProvider);
```

## Architecture

- **Billing service facade** -- `createBillingService()` returns a unified interface wrapping metering, invoicing, payment, and webhook handling. Application code uses one object for all billing operations.
- **Usage metering** -- records events with customerId, metric name, quantity, and tags. The aggregator groups by metric, applies pricing rules (per-unit, tiered, flat), and produces line items.
- **Invoice generation** -- takes aggregated line items and produces a structured Invoice with totals, currency, and status tracking. Supports JSON and Markdown export.
- **Payment provider registry with self-registration** -- each provider module (stripe, mock) calls `registerProvider()` at import time. Adding a custom provider is one `registerProvider()` call.
- **Stripe provider** -- lazy `new Stripe(apiKey)` initialization, circuit breaker on all API calls, webhook signature verification via `stripe.webhooks.constructEvent()`.
- **Circuit breaker** -- three-state (closed, open, half-open) protection on external API calls. Prevents cascade failures when Stripe is degraded.
- **Zod input validation** -- `createBillingService()` validates config against a schema before initializing the provider.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message.

## Production Readiness

- [ ] Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` environment variables
- [ ] Configure pricing rules for all tracked metrics
- [ ] Wire up webhook endpoint to receive Stripe events
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor billing_payment_total and billing_invoice_generated metrics
- [ ] Test circuit breaker behavior under Stripe outages
- [ ] Persist usage records to a database (in-memory tracker is ephemeral)
- [ ] Add idempotency keys for payment processing

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

MIT
