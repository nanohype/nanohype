# module-llm-gateway

Unified LLM gateway with pluggable routing strategies, response caching, and cost tracking.

## What you get

- Provider registry with self-registering LLM backends: `gateway` (the default), which calls the Platform's ModelGateway and holds no model credential, a direct `bedrock` provider, and `mock`
- `anthropic`, `openai` and `groq` key providers behind `IncludeKeyProviders`, for an application off the nanohype substrate
- Five routing strategies: static priority, round-robin, latency-based, cost-based, adaptive (epsilon-greedy)
- Three caching strategies: content-hash with fixed TTL, sliding-TTL that extends on hit, and passthrough
- Cost tracking with attribution by model, user, and project
- Anomaly detection using z-score analysis on rolling cost windows
- Token counting via js-tiktoken with model-aware encoding cache
- Circuit breaker on every provider for fault isolation
- OTel metrics for request count, latency, token usage, cost, and Bedrock prompt-cache effectiveness

## Bedrock prompt caching

Both paths to Bedrock mark the end of the system prompt as a cache point, so a stable prefix
is amortized across turns. The `gateway` provider sends the system prompt as a block carrying
`cache_control: ephemeral`, which the ModelGateway hands Bedrock, and reads the
`cache_read_input_tokens` / `cache_creation_input_tokens` its reply reports. The `bedrock`
provider sends a Converse `cachePoint` and reads `cacheReadInputTokens` /
`cacheWriteInputTokens`. Each surfaces them on the response (`cacheReadTokens` /
`cacheWriteTokens`) and prices them (reads ~10%, writes ~125% of the input rate). The gateway
emits a `bedrock_cache_total` counter labeled `kind` (hit / write / miss) so the hit ratio —
`hit / (hit + write)` — is observable and the prompt-caching mandate is verifiable.

## Variables

| Variable              | Type   | Default                                                         | Description                                                                |
| --------------------- | ------ | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ProjectName`         | string | --                                                              | Kebab-case project name                                                    |
| `Description`         | string | `Unified LLM gateway with routing, fallback, and cost tracking` | Project description                                                        |
| `DefaultProvider`     | string | `gateway`                                                       | Default LLM provider (gateway/bedrock/anthropic/openai/groq or custom)     |
| `PlatformName`        | string | `${ProjectName}`                                                | Platform CR the project deploys under; sets the gateway's default endpoint |
| `RoutingStrategy`     | string | `adaptive`                                                      | Default routing strategy (static/round-robin/latency/cost/adaptive)        |
| `IncludeKeyProviders` | bool   | `false`                                                         | Include the API-key providers, for use off the substrate only              |
| `ProviderCheck` | string | derived | Derived from `DefaultProvider` and the Include variables; fails the scaffold when `DefaultProvider` names a provider the project leaves out. Leave it unset |

## Project layout

```text
<ProjectName>/
  src/
    gateway/
      index.ts                  # createGateway facade
      types.ts                  # Shared interfaces
      bootstrap.ts              # Placeholder validation guard
      metrics.ts                # OTel counters and histograms
      providers/
        types.ts                # GatewayProvider interface
        registry.ts             # Provider registry (register, get, list)
        gateway.ts              # The Platform's ModelGateway, no credential
        bedrock.ts              # Claude Sonnet on Bedrock, off the substrate
        anthropic.ts            # Claude Sonnet via @anthropic-ai/sdk (IncludeKeyProviders)
        openai.ts               # GPT-4o via openai SDK (IncludeKeyProviders)
        groq.ts                 # Llama 3 via groq-sdk (IncludeKeyProviders)
        mock.ts                 # Deterministic test provider
        index.ts                # Barrel — triggers self-registration
      routing/
        types.ts                # RoutingStrategy interface
        registry.ts             # Strategy registry
        static.ts               # Fixed priority list
        round-robin.ts          # Rotating index
        latency.ts              # Lowest p50 latency
        cost.ts                 # Cheapest meeting quality threshold
        adaptive.ts             # Epsilon-greedy exploration/exploitation
        index.ts                # Barrel — triggers self-registration
      caching/
        types.ts                # CachingStrategy interface
        registry.ts             # Caching strategy registry
        hash.ts                 # SHA-256 content hash, fixed TTL
        sliding-ttl.ts          # Extends TTL on each cache hit
        none.ts                 # Passthrough — no caching
        index.ts                # Barrel — triggers self-registration
      cost/
        pricing.ts              # Default per-model pricing table
        tracker.ts              # CostTracker — record and query costs
        anomaly.ts              # Z-score anomaly detection
      tokens/
        counter.ts              # Token counting via js-tiktoken
      __tests__/
        routing.test.ts         # Strategy selection tests
        caching.test.ts         # Cache hit/miss/extension tests
        cost.test.ts            # Pricing, attribution, anomaly tests
        tokens.test.ts          # Token counting tests
        gateway.test.ts         # Integration: cache → route → call → cost
        registry.test.ts        # All three registries
  package.json
  tsconfig.json
  vitest.config.ts
```

## Pairs with

- [ts-service](../ts-service/) -- add LLM routing to a backend service
- [agentic-loop](../agentic-loop/) -- unified provider access for agents
- [rag-pipeline](../rag-pipeline/) -- route LLM calls for generation step

## Nests inside

- [monorepo](../monorepo/)
