# module-billing-ts

Usage metering, invoice generation, and payment processing with Stripe.

## What you get

- Usage metering with per-customer events, metric names, quantities, and tags
- Period aggregation with per-unit, tiered, and flat pricing models
- Invoice generation with line items, totals, and JSON/Markdown export, formatted in each currency's own minor unit, under an ID derived from the customer, billing period and sequence within it
- Late usage billed once: `generateInvoice(customerId, period, { billed })` invoices only what the period's charged invoices leave out, under the period's next sequence
- A billing service facade over customers, subscriptions, charges, invoice listing, and webhooks, all through the one provider it initialized
- Stripe payment processing with an explicit request timeout and retry count, and charges that resume rather than repeat: charging an invoice ID again (a retry, or the same customer and period regenerated) finds the Stripe invoice the first charge wrote, checks it bills the same lines, and finishes it. Usage recorded after the first charge comes back as `invoice_content_changed` with what Stripe billed, never as paid. The search reads the customer's Stripe invoices created since the period's start, less `stripe.chargeLeadMs` and an hour for clock skew, and a charge further ahead of its period than that lead is refused, so every charge of an ID lands where later charges look. A search cut short at `MAX_LISTED` writes nothing and reports `lookup_exhausted` unless the caller passes `assumeUncharged`, and so does a read of an earlier charge's lines cut short there
- Typed charge results: a paid charge reports what this call's own payment request `collected`, so a payment two charges reach is counted at most once, and a failed one a `code` — `declined`, `payment_pending`, `unavailable`, `rejected`, `aborted`, `invoice_closed`, `lookup_exhausted`, `before_charge_window`, or `invoice_content_changed`
- A charge deadline: `chargeInvoice(invoice, { signal })` starts no Stripe call once the signal aborts and reports `aborted`, and charging the invoice again resumes it. A call already in flight runs on, for up to `maxNetworkRetries + 1` attempts of `timeoutMs` (two at 0 retries when the first connection closes) with up to 5 seconds of the SDK's backoff before each retry
- A circuit breaker that opens on Stripe outages (connection failures, timeouts, 5xx) and never on a declined card or other 4xx
- Webhook signature verification and dispatch on Stripe's own event names, with the event ID carried for dedupe and subscription statuses normalized so an unknown one never reads as entitled
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
        generator.ts          # Invoice creation from line items
        formatter.ts          # JSON and Markdown output
        types.ts              # Invoicing-specific types
      providers/
        types.ts              # PaymentProvider interface
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
          circuit-breaker.test.ts
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
