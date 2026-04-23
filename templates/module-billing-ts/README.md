# module-billing-ts

Usage metering, invoice generation, and payment processing with Stripe.

## What you get

- Usage metering with per-customer events, metric names, quantities, and tags
- Period aggregation with per-unit, tiered, and flat pricing models
- Invoice generation with line items, totals, and JSON/Markdown export
- Stripe payment processing with lazy SDK init and circuit breaker
- Webhook signature verification and lifecycle event dispatch
- Pluggable payment provider registry (Stripe + in-memory mock)
- OTel metrics for usage, invoices, and payment totals

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Usage metering and billing with Stripe` | Project description |
| `PaymentProvider` | string | `stripe` | Default payment provider (stripe/mock or custom) |

## Project layout

```text
<ProjectName>/
  src/
    billing/
      index.ts                # Main exports -- createBillingService facade
      types.ts                # Core domain types
      config.ts               # Zod config validation
      metering/
        tracker.ts            # Usage event recording
        aggregator.ts         # Period aggregation with pricing
        types.ts              # Metering-specific types
      invoicing/
        generator.ts          # Invoice creation from line items
        formatter.ts          # JSON and Markdown output
        types.ts              # Invoicing-specific types
      providers/
        types.ts              # PaymentProvider interface
        registry.ts           # Factory-based registry
        stripe.ts             # Stripe SDK wrapper
        mock.ts               # In-memory test provider
        index.ts              # Barrel -- triggers self-registration
      webhooks/
        handler.ts            # Signature verification + dispatch
      resilience/
        circuit-breaker.ts    # Three-state circuit breaker
      __tests__/
        metering.test.ts
        invoicing.test.ts
        webhook.test.ts
        registry.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- host the billing API
- [module-webhook-ts](../module-webhook-ts/) -- receive Stripe webhooks
- [module-queue-ts](../module-queue-ts/) -- async invoice processing

## Nests inside

- [monorepo](../monorepo/)
