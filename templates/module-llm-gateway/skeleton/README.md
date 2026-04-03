# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createGateway } from "./gateway/index.js";

const gateway = createGateway({
  providers: ["__DEFAULT_PROVIDER__"],
  routingStrategy: "__ROUTING_STRATEGY__",
  cachingStrategy: "hash",
});

// Send a chat request
const response = await gateway.chat([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "What is the capital of France?" },
]);

console.log(response.text);       // "The capital of France is Paris."
console.log(response.provider);   // "anthropic"
console.log(response.cost);       // 0.000135
console.log(response.cached);     // false

// Second identical call hits the cache
const cached = await gateway.chat([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "What is the capital of France?" },
]);
console.log(cached.cached);       // true

// Query costs
const costs = gateway.getCosts({ tags: { user: "alice" } });
console.log(costs.totalCost);     // 0.000135
console.log(costs.byModel);       // { "claude-sonnet-4-20250514": 0.000135 }

// Shut down
gateway.close();
```

## Providers

| Provider | Backend | Default Model | Pricing (input/output per 1M) |
|----------|---------|---------------|-------------------------------|
| `anthropic` | Claude Sonnet | `claude-sonnet-4-20250514` | $3 / $15 |
| `openai` | GPT-4o | `gpt-4o` | $2.50 / $10 |
| `groq` | Llama 3 70B | `llama-3.3-70b-versatile` | $0.59 / $0.79 |
| `mock` | In-memory | `mock-model` | $0 / $0 |

Each provider wraps its API calls in a circuit breaker that opens after 5 failures in 60 seconds and probes again after 30 seconds.

## Routing Strategies

| Strategy | Behavior |
|----------|----------|
| `static` | Fixed priority list, always picks the first available provider |
| `round-robin` | Rotates through providers in order |
| `latency` | Picks provider with lowest p50 latency from a sliding window of 100 calls |
| `cost` | Picks cheapest provider that meets an 80% success rate quality threshold |
| `adaptive` | Epsilon-greedy: exploits the best-known provider 90% of the time, explores randomly 10%. Falls back to static with < 10 data points |

## Caching Strategies

| Strategy | Behavior |
|----------|----------|
| `hash` | SHA-256 of model+prompt+params, fixed TTL (default 1 hour), in-memory Map |
| `sliding-ttl` | Same hash key, but TTL extends on each cache hit |
| `none` | Passthrough, never caches (for non-deterministic generation) |

## Cost Tracking

Every non-cached request is recorded with attribution tags. Query costs by provider, model, user, project, or time range:

```typescript
// Record with tags
await gateway.chat(messages, {
  tags: { user: "alice", project: "research" },
});

// Query by user
const aliceCosts = gateway.getCosts({ tags: { user: "alice" } });

// Query by time range
const todayCosts = gateway.getCosts({
  since: "2024-01-01T00:00:00Z",
  until: "2024-01-02T00:00:00Z",
});
```

### Anomaly Detection

Detect cost spikes using z-score analysis on a rolling window:

```typescript
import { detectAnomalies } from "./gateway/cost/anomaly.js";

const entries = gateway.getCosts().entries;
const anomalies = detectAnomalies(entries, 20, 2.0);

for (const a of anomalies) {
  console.log(`Anomaly: $${a.entry.cost} (z=${a.zScore.toFixed(2)}, mean=$${a.rollingMean.toFixed(4)})`);
}
```

## Custom Providers

Implement the `GatewayProvider` interface and register it:

```typescript
import { registerProvider } from "./gateway/providers/index.js";
import type { GatewayProvider } from "./gateway/providers/index.js";

const myProvider: GatewayProvider = {
  name: "my-llm",
  pricing: { input: 1, output: 5 },
  async chat(messages, opts) {
    // Call your LLM API
    return { text: "...", model: "my-model", provider: "my-llm", ... };
  },
  countTokens(text) {
    return Math.ceil(text.length / 4);
  },
};

registerProvider(myProvider);
```

## Architecture

- **Gateway facade** -- `createGateway()` returns a `Gateway` object that orchestrates provider selection, caching, and cost tracking behind a single `chat()` method. Application code never touches provider internals or strategy state.
- **Provider registry with self-registration** -- each provider module (anthropic, openai, groq, mock) calls `registerProvider()` at import time. Adding a custom provider is one `registerProvider()` call.
- **Routing strategy registry** -- five built-in strategies self-register. The gateway delegates provider selection to the active strategy, which receives the full list of available providers and request context.
- **Caching strategy registry** -- three built-in strategies self-register. The gateway checks cache before routing and stores responses after successful calls.
- **Cost tracker** -- records every non-cached request with attribution tags. Supports filtered queries with breakdowns by model, user, and project.
- **Anomaly detection** -- z-score analysis on a rolling cost window flags entries that deviate significantly from the mean, surfacing unexpected spend before it compounds.
- **Circuit breaker** -- every provider wraps API calls in a circuit breaker that opens after repeated failures and probes periodically to detect recovery.
- **Zod input validation** -- `createGateway()` validates its arguments against a schema before initializing, catching configuration errors at construction time.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any initialization.

## Production Readiness

- [ ] Set all provider API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`)
- [ ] Choose a routing strategy appropriate for your workload (adaptive for multi-provider, static for single)
- [ ] Configure caching strategy and TTL for your latency/freshness tradeoff
- [ ] Set up cost alerts using anomaly detection with appropriate thresholds
- [ ] Monitor OTel metrics: `gateway_request_total`, `gateway_cost_usd`, `gateway_cache_total`
- [ ] Tune circuit breaker thresholds for your provider SLAs
- [ ] Consider persistent cost storage (the built-in tracker is in-memory)
- [ ] Set `LOG_LEVEL=warn` for production

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
