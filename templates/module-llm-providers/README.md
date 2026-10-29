# module-llm-providers

Shared LLM provider pack -- the canonical interface for all AI templates.

## What you get

- Factory-based provider registry; each built-in provider is one module-level instance that lives as long as the process, so its client, circuit breaker and log-once state hold across lookups
- Gateway provider, the default: calls the Platform's `ModelGateway` over native Anthropic Messages and sends no credential, since on the nanohype substrate the gateway holds the Bedrock role and applies the route's guardrail and rate limit. Endpoint from `MODEL_GATEWAY_ENDPOINT`, defaulting to the Service the eks-agent-platform operator creates for the Platform; route from `MODEL_ROUTE`
- Mock provider with deterministic keyword-matched responses (always included)
- Optional, with `IncludeBedrock`: AWS Bedrock over the Converse API, called directly under the AWS credential chain (an ECS task role, a local AWS profile), for an application off the substrate. A non-Claude model is a Bedrock model id or a `ModelGateway` route, so no provider holds a provider key
- Unified streaming via `AsyncIterable<StreamChunk>` normalization
- Token counting via js-tiktoken with cached encoders
- Gateway adapter for bridging to the module-llm-gateway interface
- OTel metrics: request totals, duration, token usage
- Per-instance circuit breakers for fault isolation
- Pricing table for cost estimation

## Variables

| Variable          | Type   | Default                                                       | Description                                                                                                                                                                        |
| ----------------- | ------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectName`     | string | --                                                            | Kebab-case project name                                                                                                                                                            |
| `Description`     | string | `LLM provider pack for the Platform ModelGateway and Bedrock` | Project description                                                                                                                                                                |
| `DefaultProvider` | string | `gateway`                                                     | Default LLM provider                                                                                                                                                               |
| `PlatformName`    | string | `${ProjectName}`                                              | Platform CR the project deploys under; names the default gateway Service `<PlatformName>-gateway`                                                                                  |
| `IncludeBedrock`  | bool   | `false`                                                       | Include the AWS Bedrock provider, which calls Bedrock under the AWS credential chain, for an application off the substrate                                                         |
| `ProviderCheck`   | string | derived                                                       | Derived from `DefaultProvider` and `IncludeBedrock`; fails the scaffold when `DefaultProvider` is `bedrock` and the project leaves it out. The scaffold rejects a value set for it |

## Project layout

```text
<ProjectName>/
  src/
    llm-providers/
      index.ts                  # createProviderRegistry() facade, re-exports
      types.ts                  # ChatMessage, ChatOptions, LlmResponse, StreamChunk, etc.
      config.ts                 # Zod validated config
      bootstrap.ts              # Unresolved placeholder detection
      logger.ts                 # Structured logger
      metrics.ts                # OTel metrics
      providers/
        types.ts                # LlmProvider interface (canonical)
        registry.ts             # Factory-based registry
        gateway.ts              # The Platform ModelGateway, no credential
        bedrock.ts              # (conditional) AWS Bedrock, under the AWS credential chain
        mock.ts                 # Deterministic test provider
        index.ts                # Barrel with self-registration
      adapters/
        gateway.ts              # LlmProvider -> GatewayProvider shape
        streaming.ts            # Normalize provider streams
      tokens/
        counter.ts              # js-tiktoken token counting
      resilience/
        circuit-breaker.ts      # Sliding-window circuit breaker
        request-timeout.ts      # LLM_REQUEST_TIMEOUT_MS, its parse, and withRequestTimeout()
        stream-guard.ts         # A stream as one breaker call, bounded per event
        __tests__/
          circuit-breaker.test.ts
          request-timeout.test.ts
          stream-guard.test.ts
      __tests__/
        registry.test.ts
        mock.test.ts
        adapters.test.ts
        tokens.test.ts
        provider-contract.ts              # Breaker and timeout contract each provider runs
        pricing.test.ts                   # Pricing table lookups
        gateway-request.test.ts           # gateway against an in-process HTTP server
        bedrock-request.test.ts           # (conditional) AWS Bedrock SDK over an in-process handler
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add LLM capabilities to a service
- [agentic-loop](../agentic-loop/) -- power agent tool-calling loops
- [rag-pipeline](../rag-pipeline/) -- generation step in retrieval-augmented generation
- [module-llm-gateway](../module-llm-gateway/) -- bridge providers into gateway routing
- [module-llm-observability](../module-llm-observability/) -- trace and monitor LLM calls

## Nests inside

- [monorepo](../monorepo/)
