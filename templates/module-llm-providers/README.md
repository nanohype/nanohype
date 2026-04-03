# module-llm-providers

Shared LLM provider pack -- the canonical interface for all AI templates.

## What you get

- Factory-based provider registry with no module-level mutable state
- Anthropic provider (Claude Sonnet, Opus, Haiku) with streaming and circuit breaker
- OpenAI provider (GPT-4o, GPT-4o-mini, o1) with streaming and circuit breaker
- Groq provider (Llama, Mixtral) with streaming and circuit breaker
- Mock provider with deterministic keyword-matched responses (always included)
- Optional: AWS Bedrock, Azure OpenAI, Google Vertex AI, Hugging Face, Ollama
- Unified streaming via `AsyncIterable<StreamChunk>` normalization
- Token counting via js-tiktoken with cached encoders
- Gateway adapter for bridging to the module-llm-gateway interface
- OTel metrics: request totals, duration, token usage
- Per-instance circuit breakers for fault isolation
- Pricing table for cost estimation

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `LLM provider pack for Anthropic, OpenAI, Bedrock, Azure, and more` | Project description |
| `DefaultProvider` | string | `anthropic` | Default LLM provider |
| `IncludeBedrock` | bool | `false` | Include AWS Bedrock provider |
| `IncludeAzure` | bool | `false` | Include Azure OpenAI provider |
| `IncludeVertex` | bool | `false` | Include Google Vertex AI provider |
| `IncludeHuggingFace` | bool | `false` | Include Hugging Face Inference provider |
| `IncludeOllama` | bool | `false` | Include Ollama local inference provider |

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
        anthropic.ts            # Claude via @anthropic-ai/sdk
        openai.ts               # GPT-4o via openai SDK
        groq.ts                 # Llama via groq-sdk
        bedrock.ts              # (conditional) AWS Bedrock
        azure-openai.ts         # (conditional) Azure OpenAI
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
        __tests__/
          circuit-breaker.test.ts
      __tests__/
        registry.test.ts
        mock.test.ts
        adapters.test.ts
        tokens.test.ts
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
