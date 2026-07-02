# module-llm-gateway

Unified LLM gateway with pluggable routing strategies, response caching, and cost tracking.

## What you get

- Provider registry with self-registering LLM backends (Anthropic, OpenAI, Groq, mock)
- Five routing strategies: static priority, round-robin, latency-based, cost-based, adaptive (epsilon-greedy)
- Three caching strategies: content-hash with fixed TTL, sliding-TTL that extends on hit, and passthrough
- Cost tracking with attribution by model, user, and project
- Anomaly detection using z-score analysis on rolling cost windows
- Token counting via js-tiktoken with model-aware encoding cache
- Circuit breaker on every provider for fault isolation
- OTel metrics for request count, latency, token usage, cost, and Bedrock prompt-cache effectiveness

## Bedrock prompt caching

The Bedrock provider sends a `cachePoint` after the system prompt, so a stable prefix is
amortized across turns. Converse reports `cacheReadInputTokens` / `cacheWriteInputTokens`,
which the provider surfaces on the response (`cacheReadTokens` / `cacheWriteTokens`) and
prices correctly (reads ~10%, writes ~125% of the input rate). The gateway emits a
`bedrock_cache_total` counter labeled `kind` (hit / write / miss) so the hit ratio —
`hit / (hit + write)` — is observable and the prompt-caching mandate is verifiable.

This is measurable only via Converse: the raw InvokeModel API marks the system prompt with
`cache_control: ephemeral` but does not return cache token counts, so the gateway
standardizes on Converse for measured caching.

## Variables

| Variable          | Type   | Default                                                         | Description                                                         |
| ----------------- | ------ | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `ProjectName`     | string | --                                                              | Kebab-case project name                                             |
| `Description`     | string | `Unified LLM gateway with routing, fallback, and cost tracking` | Project description                                                 |
| `DefaultProvider` | string | `anthropic`                                                     | Default LLM provider (anthropic/openai/groq or custom)              |
| `RoutingStrategy` | string | `adaptive`                                                      | Default routing strategy (static/round-robin/latency/cost/adaptive) |

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
        anthropic.ts            # Claude Sonnet via @anthropic-ai/sdk
        openai.ts               # GPT-4o via openai SDK
        groq.ts                 # Llama 3 via groq-sdk
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
