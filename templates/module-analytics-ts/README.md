# module-analytics-ts

Event tracking and product analytics with pluggable backends.

## What you get

- Factory-based provider registry with self-registering analytics backends
- Segment provider (HTTP batch API, native fetch, write key auth)
- PostHog provider (batch capture API, native fetch, project API key)
- Mixpanel provider (batch track + engage, native fetch, project token)
- Amplitude provider (HTTP V2 batch, native fetch, API key)
- In-memory mock provider with inspectable `.events` array for testing
- Instance-scoped event buffer with interval and capacity flushing
- Hono and Express middleware factories for automatic request tracking
- Per-instance circuit breakers for resilience
- OTel metrics (events tracked, flush totals, flush duration)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Event tracking and product analytics` | Project description |
| `AnalyticsProvider` | string | `posthog` | Default analytics provider (posthog/segment/mixpanel/amplitude/mock or custom) |

## Project layout

```text
<ProjectName>/
  src/
    analytics/
      index.ts              # Main exports -- createAnalyticsClient facade
      types.ts              # TrackEvent, IdentifyPayload, GroupPayload, PagePayload
      config.ts             # Zod-validated configuration
      bootstrap.ts          # Placeholder detection guard
      logger.ts             # Structured JSON logger
      metrics.ts            # OTel counters and histograms
      providers/
        types.ts            # AnalyticsProvider interface + factory type
        registry.ts         # Factory-based provider registry
        segment.ts          # Segment HTTP batch API provider
        posthog.ts          # PostHog batch capture provider
        mixpanel.ts         # Mixpanel batch track + engage provider
        amplitude.ts        # Amplitude HTTP V2 batch provider
        mock.ts             # In-memory provider with .events array
        index.ts            # Barrel import -- triggers self-registration
      buffer/
        event-buffer.ts     # Instance-scoped event buffer
      middleware/
        hono.ts             # Hono middleware factory
        express.ts          # Express middleware factory
      resilience/
        circuit-breaker.ts  # Circuit breaker state machine
        __tests__/
          circuit-breaker.test.ts
      __tests__/
        registry.test.ts
        mock.test.ts
        buffer.test.ts
        middleware.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add analytics to a service
- [next-app](../next-app/) -- track page views and user events
- [go-service](../go-service/) -- server-side event tracking

## Nests inside

- [monorepo](../monorepo/)
