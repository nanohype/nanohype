# module-billing-ts

Usage metering, invoice generation, and payment processing with Stripe.

## What you get

- Usage metering with per-customer events, metric names, quantities, and tags
- Period aggregation with per-unit, tiered, and flat pricing models
- Invoice generation with line items, totals, and JSON/Markdown export, under an ID derived from the customer, billing period and sequence within it
- Late usage billed once, under the period's next invoice ([Charges](skeleton/README.md#charges))
- A billing service facade over customers, subscriptions, charges, invoice listing, and webhooks, all through the one provider it initialized
- Stripe charges that resume rather than repeat when an invoice ID is charged again, never report an invoice that bills other content as paid, and leave Stripe's automatic collection off on every invoice until its finalized lines are read back and found to bill what was charged ([How a charge resumes](skeleton/README.md#how-a-charge-resumes))
- Typed charge results: what a paid charge collected, or a failure `code` ([Charges](skeleton/README.md#charges))
- A charge deadline through an `AbortSignal` ([Charge deadline](skeleton/README.md#charge-deadline))
- A circuit breaker that opens on Stripe outages and never on a declined card or other 4xx
- Webhook signature verification and dispatch on Stripe's own event names ([Webhooks](skeleton/README.md#webhooks))
- `isEntitled(status)` — the one predicate for whether a subscription grants access
- Pluggable payment provider registry (Stripe + an in-memory mock that starts only when named)
- OTel metrics for usage, invoices, the amounts charges collected by currency, and charge calls by result

## Variables

| Variable          | Type   | Default                                  | Description                                                               |
| ----------------- | ------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| `ProjectName`     | string | --                                       | Kebab-case project name                                                   |
| `Description`     | string | `Usage metering and billing with Stripe` | Project description                                                       |
| `PaymentProvider` | string | `stripe`                                 | Provider used when the config names none (stripe, mock, or a custom name) |

`PaymentProvider` sets `DEFAULT_PROVIDER` in `src/billing/config.ts`. The mock
refuses to start unless the config names it, so a project scaffolded with
`mock` as its default still has to select it explicitly.

## Project layout

```text
<ProjectName>/
  src/
    billing/
      index.ts                # createBillingService facade and public exports
      types.ts                # Core domain types
      config.ts               # Zod config validation, DEFAULT_PROVIDER
      subscriptions.ts        # isEntitled() subscription-status predicate
      bootstrap.ts            # Unresolved-placeholder guard
      logger.ts               # Structured JSON logger (LOG_LEVEL)
      metrics.ts              # OTel counters
      metering/
        tracker.ts            # Usage event recording
        aggregator.ts         # Period aggregation with pricing
        types.ts              # Metering-specific types
      invoicing/
        content.ts            # Whether two invoices bill the same content
        generator.ts          # Invoice creation from line items
        formatter.ts          # JSON and Markdown output
        types.ts              # Invoicing-specific types
      providers/
        types.ts              # PaymentProvider interface
        errors.ts             # ProviderConfigError
        registry.ts           # Factory-based registry
        stripe.ts             # Stripe SDK wrapper
        stripe-config.ts      # Stripe config type, schema and client defaults
        mock.ts               # In-memory provider, started only when named
        index.ts              # Barrel -- triggers self-registration
      webhooks/
        handler.ts            # Signature verification + dispatch
      resilience/
        circuit-breaker.ts    # Three-state circuit breaker with a failure predicate
      __tests__/
        billing-service.test.ts   # Facade against the real Stripe SDK, transport faked
        default-provider.test.ts
        stripe.test.ts            # Stripe provider against the real SDK, transport faked
        fake-stripe.ts            # In-process Stripe transport and account for tests
        readme.test.ts            # Holds the README's custom-provider example to the file below
        readme-custom-provider.ts # The README's custom-provider example, compiled by typecheck
        webhook.test.ts
        metering.test.ts
        invoicing.test.ts
        registry.test.ts
        circuit-breaker.test.ts
  .env.example
  biome.json
  package.json
  tsconfig.json
  tsconfig.build.json         # Build config -- excludes tests from dist/
  vitest.config.ts
  README.md
```

## Pairs with

- [ts-service](../ts-service/) -- host the billing API
- [module-webhook-ts](../module-webhook-ts/) -- receive Stripe webhooks
- [module-queue-ts](../module-queue-ts/) -- async invoice processing

## Nests inside

- [monorepo](../monorepo/)
