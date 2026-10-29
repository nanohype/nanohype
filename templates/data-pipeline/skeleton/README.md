# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Copy .env.example and set the gateway endpoint and route, if not the defaults
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
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome |
| `npm run test` | Run tests |

## Architecture

The pipeline follows a four-stage ETL design with pluggable components at each stage:

1. **Ingest** (`src/pipeline/ingest/`) -- load documents from files or web pages
2. **Transform** (`src/pipeline/transform/`) -- chunk documents using recursive, fixed-size, or semantic strategies
3. **Embed** (`src/pipeline/embed/`) -- generate vector embeddings through the Platform ModelGateway, Bedrock, or a mock provider
4. **Output** (`src/pipeline/output/`) -- write embedded chunks to JSONL file or console

Each stage uses a factory-based registry pattern (`registry.ts`):

- **Ingest sources**: file (PDF, Markdown, text, JSON, CSV), web (HTML extraction)
- **Chunk strategies**: recursive (separator hierarchy), fixed-size (character count), semantic (Jaccard similarity)
- **Embedding providers**: gateway (the Platform ModelGateway, the default), bedrock (Titan v2), mock (hash-based deterministic), and with `IncludeKeyProviders` openai (text-embedding-3-small)
- **Output adapters**: json-file (JSONL), console (pretty-print)

### Model access

The `gateway` embedding provider calls the Platform's ModelGateway, the path to a model on the nanohype substrate. The eks-agent-platform operator runs the gateway under the tenant's EKS Pod Identity, holding the Bedrock role, so the pipeline holds no model credential and sends none. `MODEL_GATEWAY_ENDPOINT` is the gateway root, as ModelGateway `status.endpoint` publishes it, and defaults to the Service the operator creates for the Platform named at scaffold time. Requests name the `EMBEDDING_ROUTE` route (`embeddings`), which the ModelGateway CR maps to a Bedrock model, and ask it for `EMBEDDING_DIMENSIONS`. The gateway's embeddings translation embeds one input per request, so the gateway embedder sends one request per chunk.

The `bedrock` provider calls Bedrock directly over the AWS credential chain, for a pipeline that runs off the substrate. A project scaffolded with `IncludeKeyProviders` also carries the openai provider, which authenticates with `OPENAI_API_KEY`; the LLM policy permits a provider key only off the substrate, for a provider the intake brief names, with the key read from the environment or the OS keychain and never committed.

### Design Decisions

- **Four-stage pipeline** -- ingest, transform, embed, and index are discrete stages chained by the orchestrator. `createPipeline(config)` returns a `{ run() }` object that executes all four stages in sequence.
- **Factory-based registries** -- each stage has its own registry where providers self-register on import. Swapping a backend is one configuration change; the registry resolves the correct factory at runtime.
- **Per-document error handling** -- if any document fails at any stage, the error is captured in `PipelineResult.errors` and the pipeline continues with remaining items. No single failure aborts the run.
- **Progress callbacks** -- `onProgress({ stage, processed, total, document })` fires at stage transitions and per-document boundaries for monitoring and UI integration.
- **VectorDocument-compatible output** -- the JSONL adapter writes objects with `id`, `content`, `embedding`, and `metadata` fields, matching `module-vector-store`'s `VectorDocument` interface.
- **Lazy SDK initialization** -- the OpenAI client is created on first use, not at import time, keeping startup fast and avoiding errors when the provider isn't selected.
- **Circuit breaker** -- all external API calls (embeddings) are wrapped in a sliding-window circuit breaker that fast-fails after repeated failures.
- **OTel metrics** -- `pipeline_requests_total`, `pipeline_errors_total` (the RED pair a SLOPolicy availability SLI reads), `pipeline_chunks_created`, and `pipeline_duration_ms` are emitted as OTel counters/histograms. No-ops without an OTel SDK.

## Configuration

All settings are loaded from environment variables. See `.env.example` for the full list.

| Variable | Default | Description |
|---|---|---|
| `EMBEDDING_PROVIDER` | `__EMBEDDING_PROVIDER__` | Embedding provider name |
| `MODEL_GATEWAY_ENDPOINT` | the Platform's gateway Service | ModelGateway root the gateway provider calls |
| `EMBEDDING_ROUTE` | `embeddings` | ModelGateway route the gateway provider names |
| `EMBEDDING_MODEL` | `amazon.titan-embed-text-v2:0` | Embedding model the bedrock and openai providers call |
| `EMBEDDING_DIMENSIONS` | `1024` | Output embedding dimensions |
| `EMBEDDING_BATCH_SIZE` | `128` | Texts per openai embedding request |
| `EMBED_REQUEST_TIMEOUT_MS` | `30000` | How long an embedding call waits: a whole number of milliseconds from 1 to 2147483647, and any other value fails the import |
| `CHUNK_STRATEGY` | `recursive` | Chunking strategy name |
| `CHUNK_SIZE` | `512` | Target chunk size in tokens |
| `CHUNK_OVERLAP` | `64` | Overlap between chunks in tokens |
| `OUTPUT_ADAPTER` | `json-file` | Output adapter name |
| `OUTPUT_FILE` | `./output/embeddings.jsonl` | JSONL output file path |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Confirm the Platform's ModelGateway serves the `EMBEDDING_ROUTE` route at `EMBEDDING_DIMENSIONS`
- [ ] Tune `CHUNK_SIZE` and `CHUNK_OVERLAP` for your document corpus
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor embedding API costs -- batch size and document volume directly affect spend
- [ ] Connect output to a vector store (see `module-vector-store`)
- [ ] Set up alerting on pipeline errors and duration
