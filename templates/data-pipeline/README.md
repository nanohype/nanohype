# data-pipeline

Scaffolds an ETL pipeline for AI workloads in TypeScript. Implements document ingestion, configurable chunking strategies, embedding generation, and output adapters for indexing. All components are built from first principles using provider SDKs directly -- no LangChain or other orchestration frameworks.

## What you get

- **Document ingestion** -- load PDF, Markdown, plain text, JSON, CSV files or scrape web pages
- **Configurable chunking** -- recursive character splitting, fixed-size, or semantic (Jaccard similarity)
- **Embedding generation** -- OpenAI (text-embedding-3-small) or deterministic mock for testing
- **Output adapters** -- JSONL file or pretty-print console, compatible with module-vector-store
- **Pipeline orchestrator** -- chains stages with progress callbacks and per-document error handling
- **Resilience** -- circuit breaker on external API calls, lazy SDK initialization

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | "Data pipeline for AI workloads" | Project description |
| `EmbeddingProvider` | string | `openai` | Embedding provider name |
| `ChunkStrategy` | string | `recursive` | Chunking strategy name |
| `IncludeTests` | bool | `true` | Include vitest test suite |

## Project layout

```text
<ProjectName>/
  src/pipeline/
    index.ts                           # createPipeline(config) facade + CLI entry
    types.ts                           # PipelineConfig, Document, Chunk, EmbeddedChunk, PipelineResult
    bootstrap.ts                       # Placeholder validation
    logger.ts                          # Structured JSON logger
    metrics.ts                         # OTel counters and histograms
    orchestrator.ts                    # Four-stage pipeline chain with error handling
    ingest/
      types.ts                         # IngestSource interface
      registry.ts                      # Factory-based source registry
      file.ts                          # PDF, Markdown, text, JSON, CSV loader
      web.ts                           # HTML page fetcher + text extraction
      index.ts                         # Barrel + self-registration
    transform/
      types.ts                         # ChunkStrategy interface
      registry.ts                      # Factory-based strategy registry
      recursive.ts                     # Recursive separator hierarchy splitting
      fixed-size.ts                    # Character count splitting with overlap
      semantic.ts                      # Sliding-window Jaccard similarity
      index.ts                         # Barrel + self-registration
    embed/
      types.ts                         # EmbeddingProvider interface
      registry.ts                      # Factory-based provider registry
      openai.ts                        # text-embedding-3-small, lazy init, circuit breaker
      mock.ts                          # Deterministic hash-based embeddings
      index.ts                         # Barrel + self-registration
    output/
      types.ts                         # OutputAdapter interface
      registry.ts                      # Factory-based adapter registry
      json-file.ts                     # JSONL file writer
      console.ts                       # Pretty-print to stdout
      index.ts                         # Barrel + self-registration
    resilience/
      circuit-breaker.ts               # Sliding-window circuit breaker
      __tests__/circuit-breaker.test.ts
    __tests__/
      orchestrator.test.ts             # Full pipeline with mocks (conditional)
      recursive.test.ts                # Recursive chunking tests (conditional)
      fixed-size.test.ts               # Fixed-size chunking tests (conditional)
      registry.test.ts                 # All 4 registry tests (conditional)
  package.json
  tsconfig.json
  eslint.config.js
  vitest.config.ts
  .env.example
  README.md
```

## Pairs with

- [module-vector-store](../module-vector-store/) -- pipe embedded chunks into a persistent vector database
- [rag-pipeline](../rag-pipeline/) -- add retrieval and LLM-powered answer generation
- [eval-harness](../eval-harness/) -- evaluate embedding and chunking quality

## Nests inside

- [monorepo](../monorepo/)
