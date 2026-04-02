# rag-pipeline

Scaffolds a Retrieval-Augmented Generation (RAG) pipeline in TypeScript. All components are implemented from first principles using provider SDKs directly — no LangChain or other orchestration frameworks.

## What you get

- **Document ingestion** — load plain text and markdown files from a directory
- **Configurable chunking** — fixed-size (token-estimated), recursive character splitting, or semantic chunking stub
- **Embedding generation** — OpenAI or Cohere
- **Vector storage** — Chroma, pgvector, Qdrant, or Pinecone
- **Similarity retrieval** — top-k search with score-based reranking and metadata filtering
- **Answer generation** — LLM-powered responses with source citations via Anthropic or OpenAI

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | "A retrieval-augmented generation pipeline" | Project description |
| `VectorStore` | string | `chroma` | chroma, pgvector, qdrant, or pinecone |
| `EmbeddingProvider` | string | `openai` | openai or cohere |
| `LlmProvider` | string | `anthropic` | anthropic or openai |
| `ChunkStrategy` | string | `recursive` | fixed, recursive, or semantic |
| `IncludeTests` | bool | `true` | Include vitest test suite |

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
      anthropic.ts                 # Anthropic LLM provider
      openai.ts                    # OpenAI LLM + embedding provider
      cohere.ts                    # Cohere embedding provider
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
  eslint.config.js
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
