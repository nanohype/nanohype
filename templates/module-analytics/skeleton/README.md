# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createAnalyticsClient } from "./analytics/index.js";

const analytics = await createAnalyticsClient("__ANALYTICS_PROVIDER__");

// Track an event
await analytics.track({
  event: "purchase_completed",
  userId: "user-1",
  properties: { amount: 99.99, currency: "USD", plan: "pro" },
});

// Identify a user
await analytics.identify({
  userId: "user-1",
  traits: { name: "Alice", email: "alice@example.com", plan: "pro" },
});

// Track a page view
await analytics.page({
  userId: "user-1",
  name: "Dashboard",
  properties: { url: "/dashboard", referrer: "/" },
});

// Flush buffered events
await analytics.flush();

// Clean shutdown
await analytics.close();
```

## Middleware

Auto-track HTTP requests with Hono or Express middleware:

```typescript
// Hono
import { createHonoAnalytics } from "./analytics/middleware/hono.js";
app.use(createHonoAnalytics(analytics.provider));

// Express
import { createExpressAnalytics } from "./analytics/middleware/express.js";
app.use(createExpressAnalytics(analytics.provider));
```

Each request generates:

```json
{
  "event": "request",
  "properties": {
    "method": "GET",
    "path": "/api/users",
    "statusCode": 200,
    "durationMs": 42,
    "userAgent": "Mozilla/5.0 ..."
  }
}
```

## Providers

| Provider | Backend | Auth | Batch Endpoint |
|----------|---------|------|----------------|
| `posthog` | PostHog API | `POSTHOG_API_KEY` | `/batch` |
| `segment` | Segment HTTP API | `SEGMENT_WRITE_KEY` | `/v1/batch` |
| `mixpanel` | Mixpanel API | `MIXPANEL_TOKEN` | `/import` + `/engage` |
| `amplitude` | Amplitude HTTP V2 | `AMPLITUDE_API_KEY` | `/2/httpapi` |
| `mock` | In-memory | none | N/A |

All providers use the batch/bulk API variant. Single events are buffered locally and sent in batches.

## Event Buffer

Each provider instance uses an internal event buffer:

- Flushes automatically when the buffer reaches capacity (default: 100 events)
- Flushes on a periodic interval (default: 10 seconds)
- Drains remaining events on `close()`
- Instance-scoped (no module-level state)

```typescript
import { createEventBuffer } from "./analytics/buffer/event-buffer.js";

const buffer = createEventBuffer({
  maxSize: 50,
  flushIntervalMs: 5000,
  onFlush: async (events) => {
    await sendToApi(events);
  },
});

buffer.add({ event: "click", userId: "123" });
await buffer.close();
```

## Custom Providers

Register a new provider factory:

```typescript
import { registerProvider } from "./analytics/providers/index.js";
import type { AnalyticsProvider } from "./analytics/providers/types.js";

function createMyProvider(): AnalyticsProvider {
  return {
    name: "my-analytics",
    async init(config) { /* ... */ },
    async track(event) { /* ... */ },
    async identify(payload) { /* ... */ },
    async group(payload) { /* ... */ },
    async page(payload) { /* ... */ },
    async flush() { /* ... */ },
    async close() { /* ... */ },
  };
}

registerProvider("my-analytics", createMyProvider);
```

## Architecture

- **Factory-based registry** -- `registerProvider(name, factory)` stores a factory function, and `getProvider(name)` calls it to produce a fresh instance. No module-level mutable state is shared between callers -- each instance has its own API client, circuit breaker, and event buffer.
- **Instance-scoped event buffer** -- each provider's buffer is created per-instance inside the factory closure. `setInterval` for periodic flush is cleared on `close()`. Buffer capacity and interval are configurable.
- **Batch-first** -- all providers use the batch/bulk API variant (Segment `/v1/batch`, PostHog `/batch`, Mixpanel `/import`, Amplitude `/2/httpapi`). Single events are buffered locally and sent in batches for efficiency.
- **Native fetch** -- all providers use native fetch (no heavy SDKs). API endpoints are called directly with appropriate auth headers.
- **Per-instance circuit breakers** -- each provider instance gets its own circuit breaker via the factory. Failures in one consumer's provider do not affect other consumers.
- **Non-blocking middleware** -- both Hono and Express middleware factories fire analytics calls without awaiting them. Analytics should never block or break the request flow.
- **OTel metrics** -- event totals, flush totals, and flush duration are recorded as OTel counters and histograms. No-ops when no SDK is configured.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.
- **Zod config validation** -- `createAnalyticsClient()` validates configuration at construction time, catching errors early.

## Production Readiness

- [ ] Set API keys for your chosen provider (see `.env.example`)
- [ ] Tune buffer size and flush interval for your event volume
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Wire in OpenTelemetry SDK for metrics collection
- [ ] Monitor `analytics_events_tracked` and `analytics_flush_duration_ms` dashboards
- [ ] Set circuit breaker thresholds appropriate for your traffic volume
- [ ] Test failover behavior when the analytics backend is unavailable
- [ ] Verify event schema matches your analytics platform's expectations
- [ ] Add middleware to your HTTP framework for automatic request tracking

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

Apache-2.0
