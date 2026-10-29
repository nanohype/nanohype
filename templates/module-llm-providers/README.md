# module-llm-providers

Shared LLM provider pack -- the canonical interface for all AI templates.

## What you get

- Factory-based provider registry; each built-in provider is one module-level instance that lives as long as the process, so its SDK client, circuit breaker and log-once state hold across lookups
- Gateway provider, the default: calls the Platform's `ModelGateway` over native Anthropic Messages and sends no credential, since on the nanohype substrate the gateway holds the Bedrock role and applies the route's guardrail and rate limit. Endpoint from `MODEL_GATEWAY_ENDPOINT`, defaulting to the Service the eks-agent-platform operator creates for the Platform; route from `MODEL_ROUTE`
- Mock provider with deterministic keyword-matched responses (always included)
- Off-substrate key providers, with `IncludeKeyProviders`: Anthropic (Claude Sonnet, Opus, Haiku), OpenAI (GPT-4o, GPT-4o-mini, o1) and Groq (Llama, Mixtral), each with streaming and a circuit breaker. The LLM policy permits a provider key only off the substrate, for a provider the intake brief names, read from the environment or the OS keychain
- Optional: AWS Bedrock (direct, over the AWS credential chain, off the substrate), Google Vertex AI, Hugging Face, Ollama
- Unified streaming via `AsyncIterable<StreamChunk>` normalization
- Token counting via js-tiktoken with cached encoders
- Gateway adapter for bridging to the module-llm-gateway interface
- OTel metrics: request totals, duration, token usage
- Per-instance circuit breakers for fault isolation
- Pricing table for cost estimation

## Variables

| Variable              | Type   | Default                                                              | Description                                                                                                                                                                          |
| --------------------- | ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProjectName`         | string | --                                                                   | Kebab-case project name                                                                                                                                                              |
| `Description`         | string | `LLM provider pack for the Platform ModelGateway, Bedrock, and more` | Project description                                                                                                                                                                  |
| `DefaultProvider`     | string | `gateway`                                                            | Default LLM provider                                                                                                                                                                 |
| `PlatformName`        | string | `${ProjectName}`                                                     | Platform CR the project deploys under; names the default gateway Service `<PlatformName>-gateway`                                                                                    |
| `IncludeKeyProviders` | bool   | `false`                                                              | Include the anthropic, openai and groq key providers, for an application that runs off the substrate                                                                                 |
| `IncludeBedrock`      | bool   | `false`                                                              | Include AWS Bedrock provider                                                                                                                                                         |
| `IncludeVertex`       | bool   | `false`                                                              | Include Google Vertex AI provider                                                                                                                                                    |
| `IncludeHuggingFace`  | bool   | `false`                                                              | Include Hugging Face Inference provider                                                                                                                                              |
| `IncludeOllama`       | bool   | `false`                                                              | Include Ollama local inference provider                                                                                                                                              |
| `ProviderCheck`       | string | derived                                                              | Derived from `DefaultProvider` and the Include variables; fails the scaffold when `DefaultProvider` names a provider the project leaves out. The scaffold rejects a value set for it |

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
        anthropic.ts            # (conditional) Claude via @anthropic-ai/sdk
        openai.ts               # (conditional) GPT-4o via openai SDK
        groq.ts                 # (conditional) Llama via groq-sdk
        bedrock.ts              # (conditional) AWS Bedrock
        vertex.ts               # (conditional) Google Vertex AI
        huggingface.ts          # (conditional) Hugging Face Inference
        ollama.ts               # (conditional) Ollama local inference
        mock.ts                 # Deterministic test provider
        index.ts                # Barrel with self-registration
      adapters/
        gateway.ts              # LlmProvider -> GatewayProvider shape
        streaming.ts            # Normalize provider streams
      tokens/
        counter.ts              # js-tiktoken token counting
      resilience/
        circuit-breaker.ts      # Sliding-window circuit breaker
        request-timeout.ts      # LLM_REQUEST_TIMEOUT_MS, its parse, and the SDK retry count
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
        gateway-request.test.ts           # gateway against an in-process HTTP server
        provider-streams.test.ts          # (conditional) The contract for anthropic, openai and groq
        anthropic-request.test.ts         # (conditional) Anthropic SDK over an in-process fetch
        chat-completions-request.test.ts  # (conditional) openai and groq SDKs over an in-process fetch
        bedrock-request.test.ts           # (conditional) AWS Bedrock
        vertex-request.test.ts            # (conditional) Google Vertex AI
        huggingface-request.test.ts       # (conditional) Hugging Face Inference
        ollama-request.test.ts            # (conditional) Ollama local inference
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
