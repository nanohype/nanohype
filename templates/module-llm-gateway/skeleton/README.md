# **PROJECT_NAME**

**DESCRIPTION**

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

console.log(response.text); // "The capital of France is Paris."
console.log(response.provider); // "gateway"
console.log(response.cost); // 0.000135
console.log(response.cached); // false

// Second identical call hits the cache
const cached = await gateway.chat([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "What is the capital of France?" },
]);
console.log(cached.cached); // true

// Query costs
const costs = gateway.getCosts({ tags: { user: "alice" } });
console.log(costs.totalCost); // 0.000135
console.log(costs.byModel); // { "claude-sonnet-5": 0.000135 }

// Shut down
gateway.close();
```

## Providers

| Provider    | Backend                                              | Default model                  | Pricing (input/output per 1M) | Included              |
| ----------- | ---------------------------------------------------- | ------------------------------ | ----------------------------- | --------------------- |
| `gateway`   | The Platform's ModelGateway (Anthropic Messages)     | route `default`                | $3 / $15                      | Always                |
| `bedrock`   | Claude Sonnet on Bedrock (Converse + cachePoint)     | `us.anthropic.claude-sonnet-5` | $3 / $15                      | Always                |
| `anthropic` | Claude Sonnet                                        | `claude-sonnet-5`              | $3 / $15                      | `IncludeKeyProviders` |
| `openai`    | GPT-4o                                               | `gpt-4o`                       | $2.50 / $10                   | `IncludeKeyProviders` |
| `groq`      | Llama 3 70B                                          | `llama-3.3-70b-versatile`      | $0.59 / $0.79                 | `IncludeKeyProviders` |
| `mock`      | In-memory                                            | `mock-model`                   | $0 / $0                       | Always                |

### Where each provider runs

`gateway` is the default provider, and the one an application on the nanohype substrate uses. The eks-agent-platform operator runs a ModelGateway per Platform: an Envoy AI Gateway in the tenant's namespace that runs under the tenant's EKS Pod Identity, holds the Bedrock role, and applies each route's guardrail and rate limit. The provider holds no model credential and sends none: it POSTs native Anthropic Messages to `<MODEL_GATEWAY_ENDPOINT>/anthropic/v1/messages` with `fetch`, so no SDK resolves a key from the environment and attaches it. `MODEL_GATEWAY_ENDPOINT` is the gateway root as ModelGateway `status.endpoint` publishes it, and defaults to the Service the operator creates for the Platform named at scaffold time (`PlatformName`). A request names a route as its model, `opts.model` or `MODEL_ROUTE` (`default`), and the ModelGateway maps each route to a Bedrock model. The system prompt carries an ephemeral `cache_control` marker, and the cache read and write tokens the reply reports land on the response.

`bedrock` calls Bedrock directly over the AWS credential chain, so it serves an application off the substrate: an ECS task role, or a local AWS profile. It puts a `cachePoint` right after the system prompt so the stable prefix is cached across turns; `cache_read`/`cache_write` tokens flow through to usage.

`anthropic`, `openai` and `groq` authenticate with a provider API key, and are part of a project scaffolded with `IncludeKeyProviders`. The LLM policy permits a provider key only off the substrate (a CLI, a desktop app, a local tool), only for a provider the intake brief names, read from the environment or the OS keychain and never committed.

### Timeouts and circuit breakers

Every provider that calls a model bounds its calls by `LLM_REQUEST_TIMEOUT_MS` (default 120s), so a hung socket trips the circuit breaker instead of hanging; a value that is not a whole number of milliseconds from 1 to 2147483647 fails the import, and each `create*Provider()` takes `requestTimeoutMs` to set it per instance. A call has to finish its whole reply within the timeout, and the default covers the 4096-token `maxTokens` default at about 34 tokens a second, so a caller that raises `maxTokens` raises the timeout with it. The `gateway` provider gives up on the whole call at one timeout, and so does `bedrock`, the SDK's retries included. The `anthropic`, `openai` and `groq` SDK clients apply it to each attempt and retry a timed-out attempt once, so an endpoint that never answers holds the caller for two timeouts plus the SDK's backoff before the gateway falls through; a caller's own client options can set `timeout` and `maxRetries`.

Each provider wraps its API calls in a circuit breaker that opens after 5 failures in 60 seconds and probes again after 30 seconds. If a provider call fails, the gateway falls through to the next configured provider in order before surfacing the error.

### Sampling parameters

Each provider decides whether its request carries the caller's `temperature`. A provider that can send something other than the caller's value declares what it sends through its `sampling(opts)` hook, and one without the hook sends the caller's value when it is set and its own default otherwise.

| Provider | `temperature` sent |
| -------- | ------------------ |
| `openai`, `groq` | The caller's value, and 1 when the caller sets none |
| `gateway`, `anthropic` | Never: every gateway route serves Claude, and the Messages API rejects `temperature`, `top_p` and `top_k` at any value |
| `bedrock` | Per model id, under `samplingParameters` |
| `mock` | Not read |

The `bedrock` provider's `samplingParameters` takes one of three values. `auto`, the default, sends the caller's `temperature` only to a model id that names a family other than Claude. A model id names its family through its provider segment — `anthropic.claude-…`, `us.anthropic.claude-…`, or either as the resource of a `foundation-model/` or `inference-profile/` ARN — and every other model id names none and is treated as Claude: an ARN of any other resource type (an application inference profile, provisioned model, imported model, custom model, custom model deployment, prompt or prompt router) or an id with no provider segment. `send` sends the caller's `temperature` to every model id, which is how an ARN serving another family receives it, and `omit` sends it to none. `BEDROCK_SAMPLING_PARAMETERS` sets it for the registered `bedrock` provider and is read when the provider's module loads, so a value other than `auto`, `send` or `omit` fails the import. `createBedrockProvider({ samplingParameters })`, imported from `./gateway/providers/bedrock.js`, sets it on a provider you register yourself.

`auto` sends no `temperature` to Claude Haiku 4.5 or Claude Sonnet 4.5, though Bedrock accepts one from either. A classification or routing call that wants temperature 0 from one of them runs under `send`.

A provider drops a `temperature` it does not send without logging it; the gateway carries no logger. The response cache keys on the temperature only when some candidate provider would send it, so a dropped value does not split cache entries.

## Routing Strategies

| Strategy      | Behavior                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static`      | Fixed priority list, always picks the first provider; the gateway falls through to the next on failure                                                                             |
| `round-robin` | Rotates through providers in order                                                                                                                                                 |
| `latency`     | Picks provider with lowest p50 latency from a sliding window of 100 calls                                                                                                          |
| `cost`        | Picks cheapest provider that meets an 80% success rate quality threshold                                                                                                           |
| `adaptive`    | Epsilon-greedy: exploits the best-known provider 90% of the time, explores randomly 10%. Falls back to static with < 10 data points                                                |
| `linucb`      | Contextual bandit (ridge regression per provider) that routes on request features — task type, token estimate, latency budget, quality. Falls back to static with < 10 data points |

### Choosing adaptive vs linucb (ICC diagnostic)

`adaptive` (epsilon-greedy) is the right default; `linucb` only pays off when a provider's reward actually depends on the request context. Decide it empirically — log routed requests and run the diagnostic in `src/gateway/diagnostics/icc.ts`:

```ts
import { computeIcc, renderIccMarkdown } from "./gateway/diagnostics/icc.js";

const report = computeIcc(routingLog); // ≥1000 logged { provider, latencyMs, success, features }
console.log(renderIccMarkdown(report));
// ICC ≥ 0.2 → switch to linucb · ≤ 0.05 → stay on adaptive · between → collect more
```

It buckets requests by context (token quartile × task type × latency budget) and measures how much of each provider's reward variance the context explains: `ICC = Var_between / (Var_between + Var_within)`.

## Caching Strategies

| Strategy      | Behavior                                                                  |
| ------------- | ------------------------------------------------------------------------- |
| `hash`        | SHA-256 of model+prompt+params, fixed TTL (default 1 hour), in-memory Map |
| `sliding-ttl` | Same hash key, but TTL extends on each cache hit                          |
| `none`        | Passthrough, never caches (for non-deterministic generation)              |

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
  console.log(
    `Anomaly: $${a.entry.cost} (z=${a.zScore.toFixed(2)}, mean=$${a.rollingMean.toFixed(4)})`,
  );
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

registerProvider("my-llm", () => myProvider);
```

A provider that leaves `temperature` out of some or all of its requests declares what it sends with `sampling(opts)`, built from the same function as the request `chat` sends. The gateway keys its response cache on the result, so a temperature the provider drops does not split cache entries. The gateway takes a provider without `sampling` to send the caller's `temperature` whenever one is set.

## Architecture

- **Gateway facade** -- `createGateway()` returns a `Gateway` object that orchestrates provider selection, caching, and cost tracking behind a single `chat()` method. Application code never touches provider internals or strategy state.
- **Provider registry with self-registration** -- each provider module (gateway, bedrock, anthropic, openai, groq, mock) calls `registerProvider()` at import time with a factory that returns one instance for the life of the process, so its client is built once and its circuit breaker sees every request. `createGatewayProvider()`, `createBedrockProvider()`, `createAnthropicProvider()`, `createOpenAIProvider()` and `createGroqProvider()`, each imported from its `./gateway/providers/<name>.js` module, build an independent instance to register under another name with its own options. Adding a custom provider is one `registerProvider()` call.
- **Routing with gateway-level fallback** -- six built-in strategies self-register. The gateway delegates provider selection to the active strategy, then tries the selected provider followed by the remaining configured providers in order, so a single provider failure doesn't fail the request.
- **Caching strategy registry** -- three built-in strategies self-register. The gateway checks cache before routing and stores responses after successful calls.
- **Cost tracker** -- records every non-cached request with attribution tags. Supports filtered queries with breakdowns by model, user, and project.
- **Anomaly detection** -- z-score analysis on a rolling cost window flags entries that deviate significantly from the mean, surfacing unexpected spend before it compounds.
- **Circuit breaker** -- every provider wraps API calls in a circuit breaker that opens after repeated failures and probes periodically to detect recovery.
- **Zod input validation** -- `createGateway()` validates its arguments against a schema before initializing, catching configuration errors at construction time.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any initialization.

## Production Readiness

- [ ] On the substrate, declare the routes this project names (`default`, and any `opts.model` route) in the Platform's ModelGateway; the gateway holds the Bedrock role, and the project holds no model credential
- [ ] Off the substrate, grant `bedrock:InvokeModel` to the role the `bedrock` provider runs as, or scaffold with `IncludeKeyProviders` and read the key the intake brief names from the environment or the OS keychain
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
