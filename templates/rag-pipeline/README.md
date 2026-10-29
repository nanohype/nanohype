# rag-pipeline

Scaffolds a Retrieval-Augmented Generation (RAG) pipeline in TypeScript. All components are implemented from first principles using provider SDKs directly — no LangChain or other orchestration frameworks.

## What you get

- **Document ingestion** — load plain text and markdown files from a directory
- **Configurable chunking** — fixed-size (token-estimated), recursive character splitting, or semantic chunking stub
- **Embedding generation** — the Platform's ModelGateway (the default, no credential) or Bedrock Titan, with OpenAI and Cohere behind `IncludeKeyProviders` for use off the substrate
- **Vector storage** — Chroma, pgvector, Qdrant, or Pinecone
- **Similarity retrieval** — top-k search with score-based reranking and metadata filtering
- **Answer generation** — LLM-powered responses with source citations via the Platform's ModelGateway (the default, no credential) or Bedrock, with Anthropic and OpenAI behind `IncludeKeyProviders` for use off the substrate

## Variables

| Variable              | Type   | Default                                     | Description                                                         |
| --------------------- | ------ | ------------------------------------------- | ------------------------------------------------------------------- |
| `ProjectName`         | string | _(required)_                                | Kebab-case project name                                             |
| `Description`         | string | "A retrieval-augmented generation pipeline" | Project description                                                 |
| `VectorStore`         | string | `chroma`                                    | chroma, pgvector, qdrant, or pinecone                               |
| `EmbeddingProvider`   | string | `gateway`                                   | gateway, bedrock, or off the substrate openai or cohere             |
| `LlmProvider`         | string | `gateway`                                   | gateway, bedrock, or off the substrate anthropic or openai          |
| `PlatformName`        | string | `ProjectName`                               | Platform CR the pipeline deploys under; sets the gateway's endpoint |
| `ChunkStrategy`       | string | `recursive`                                 | fixed, recursive, or semantic                                       |
| `IncludeTests`        | bool   | `true`                                      | Include vitest test suite                                           |
| `IncludeKeyProviders` | bool   | `false`                                     | Include the API-key providers, for use off the substrate only       |

## Project layout

```text
<ProjectName>/
  src/
    index.ts                       # CLI entry — ingest and query commands
    config.ts                      # Zod-validated config from env vars
    ingest.ts                      # Document loading + orchestration
    chunking.ts                    # Chunking strategies (fixed, recursive, semantic)
    retrieval.ts                   # Query embedding + vector search + reranking
    generation.ts                  # Context prompt + LLM call + citations
    logger.ts                      # Structured JSON logger
    providers/
      types.ts                     # LlmProvider, EmbeddingProvider, VectorStoreProvider
      registry.ts                  # Triple registry: llm, embedding, vectorstore
      index.ts                     # Barrel import + re-exports
      gateway.ts                   # Platform ModelGateway LLM + embedding provider, no credential
      bedrock.ts                   # Bedrock LLM + Titan embedding provider
      anthropic.ts                 # Anthropic LLM provider (IncludeKeyProviders)
      openai.ts                    # OpenAI LLM + embedding provider (IncludeKeyProviders)
      cohere.ts                    # Cohere embedding provider (IncludeKeyProviders)
      chroma.ts                    # ChromaDB vector store
      pgvector.ts                  # PostgreSQL + pgvector store
      qdrant.ts                    # Qdrant vector store
      pinecone.ts                  # Pinecone vector store
    __tests__/
      chunking.test.ts             # Chunking strategy tests (conditional)
      retrieval.test.ts            # Retrieval tests with mocks (conditional)
      registry.test.ts             # Provider registry tests (conditional)
  package.json
  tsconfig.json
  biome.json
  vitest.config.ts
  .env.example
  README.md
```

## Pairs with

- [agentic-loop](../agentic-loop/) -- add an agent layer on top of the RAG pipeline
- [eval-harness](../eval-harness/) -- add evaluation and benchmarking for retrieval quality
- [go-service](../go-service/) -- wrap the pipeline in a Go HTTP service

## Nests inside

- [monorepo](../monorepo/)
