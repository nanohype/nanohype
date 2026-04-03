# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Copy .env.example and configure your API keys
cp .env.example .env

# Install dependencies
npm install

# Process files from a directory
npm run run -- ./docs

# Process a web page
npm run run -- https://example.com/page
```

## Commands

| Command | Description |
|---|---|
| `npm run run` | Run the pipeline on a source path or URL |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run test` | Run tests |

## Architecture

The pipeline follows a four-stage ETL design with pluggable components at each stage:

1. **Ingest** (`src/pipeline/ingest/`) -- load documents from files or web pages
2. **Transform** (`src/pipeline/transform/`) -- chunk documents using recursive, fixed-size, or semantic strategies
3. **Embed** (`src/pipeline/embed/`) -- generate vector embeddings via OpenAI or mock provider
4. **Output** (`src/pipeline/output/`) -- write embedded chunks to JSONL file or console

Each stage uses a factory-based registry pattern (`registry.ts`):

- **Ingest sources**: file (PDF, Markdown, text, JSON, CSV), web (HTML extraction)
- **Chunk strategies**: recursive (separator hierarchy), fixed-size (character count), semantic (Jaccard similarity)
- **Embedding providers**: OpenAI (text-embedding-3-small), mock (hash-based deterministic)
- **Output adapters**: json-file (JSONL), console (pretty-print)

### Design Decisions

- **Four-stage pipeline** -- ingest, transform, embed, and index are discrete stages chained by the orchestrator. `createPipeline(config)` returns a `{ run() }` object that executes all four stages in sequence.
- **Factory-based registries** -- each stage has its own registry where providers self-register on import. Swapping a backend is one configuration change; the registry resolves the correct factory at runtime.
- **Per-document error handling** -- if any document fails at any stage, the error is captured in `PipelineResult.errors` and the pipeline continues with remaining items. No single failure aborts the run.
- **Progress callbacks** -- `onProgress({ stage, processed, total, document })` fires at stage transitions and per-document boundaries for monitoring and UI integration.
- **VectorDocument-compatible output** -- the JSONL adapter writes objects with `id`, `content`, `embedding`, and `metadata` fields, matching `module-vector-store`'s `VectorDocument` interface.
- **Lazy SDK initialization** -- the OpenAI client is created on first use, not at import time, keeping startup fast and avoiding errors when the provider isn't selected.
- **Circuit breaker** -- all external API calls (embeddings) are wrapped in a sliding-window circuit breaker that fast-fails after repeated failures.
- **OTel metrics** -- `pipeline_documents_processed`, `pipeline_chunks_created`, and `pipeline_duration_ms` are emitted as OTel counters/histograms. No-ops without an OTel SDK.

## Configuration

All settings are loaded from environment variables. See `.env.example` for the full list.

| Variable | Default | Description |
|---|---|---|
| `EMBEDDING_PROVIDER` | `openai` | Embedding provider name |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model identifier |
| `EMBEDDING_DIMENSIONS` | `1536` | Output embedding dimensions |
| `EMBEDDING_BATCH_SIZE` | `128` | Texts per embedding API call |
| `CHUNK_STRATEGY` | `recursive` | Chunking strategy name |
| `CHUNK_SIZE` | `512` | Target chunk size in tokens |
| `CHUNK_OVERLAP` | `64` | Overlap between chunks in tokens |
| `OUTPUT_ADAPTER` | `json-file` | Output adapter name |
| `OUTPUT_FILE` | `./output/embeddings.jsonl` | JSONL output file path |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Configure production API key for your embedding provider
- [ ] Tune `CHUNK_SIZE` and `CHUNK_OVERLAP` for your document corpus
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor embedding API costs -- batch size and document volume directly affect spend
- [ ] Connect output to a vector store (see `module-vector-store`)
- [ ] Set up alerting on pipeline errors and duration
