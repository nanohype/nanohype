# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Copy .env.example and point it at your Platform's ModelGateway
cp .env.example .env

# Install dependencies
npm install

# If using the chroma backend, run a Chroma server (its JS client is HTTP-only —
# there is no embedded mode). Point VECTORSTORE_CHROMA_URL at it.
docker run -d --rm -p 8000:8000 chromadb/chroma

# Ingest documents from a directory
npm run ingest -- ./docs

# Query the pipeline
npm run query -- "What is retrieval-augmented generation?"
```

## Commands

| Command | Description |
|---|---|
| `npm run ingest` | Load, chunk, embed, and store documents |
| `npm run query` | Retrieve context and generate an answer |
| `npm run eval` | Run the eval suite against live providers |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome |
| `npm run test` | Run tests |

## Architecture

The pipeline follows a modular design with pluggable providers:

1. **Ingestion** (`src/ingest.ts`) -- load files, chunk, embed, store
2. **Chunking** (`src/chunking.ts`) -- fixed, recursive, or semantic splitting
3. **Retrieval** (`src/retrieval.ts`) -- embed query, search, rerank
4. **Generation** (`src/generation.ts`) -- build context prompt, call LLM, return with citations

Providers are registered via a triple registry pattern (`src/providers/registry.ts`):

- **LLM**: Gateway (default), Bedrock, and with `IncludeKeyProviders` Anthropic (Claude) and OpenAI (GPT)
- **Embedding**: Gateway (default), Bedrock Titan, and with `IncludeKeyProviders` OpenAI and Cohere
- **Vector store**: Chroma, pgvector, Qdrant, Pinecone

### Model access

The `gateway` LLM and embedding providers call the Platform's ModelGateway, the only route to a model on the nanohype substrate. The eks-agent-platform operator runs the gateway under the tenant's EKS Pod Identity, holding the Bedrock role, so the pipeline holds no model credential and sends none. `MODEL_GATEWAY_ENDPOINT` is the gateway root, as ModelGateway `status.endpoint` publishes it, and defaults to the Service the operator creates for the Platform named at scaffold time. Generation names the `MODEL_ROUTE` route (`default`) and embeddings the `EMBEDDING_ROUTE` route (`embeddings`); the ModelGateway CR maps each to a Bedrock model. The gateway's embeddings translation embeds one input per request, so the gateway embedder sends one request per chunk.

The `bedrock` providers call Bedrock directly over the AWS credential chain, for a pipeline that runs off the substrate. A project scaffolded with `IncludeKeyProviders` also carries the anthropic, openai and cohere providers, which authenticate with a provider API key; the LLM policy permits one only off the substrate, for a provider the intake brief names, with the key read from the environment or the OS keychain and never committed.

### Design Decisions

- **Four-stage pipeline** -- ingest, chunk, embed, store are discrete stages that compose into a single `ingestDirectory()` call. The query path mirrors this: embed query, search store, filter, rerank, generate.
- **Triple registry pattern** -- LLM, embedding, and vector store providers each self-register on import. Swapping a backend is one environment variable change; the registry resolves the correct factory at runtime.
- **Pluggable chunking strategies** -- fixed (token-count heuristic), recursive (separator hierarchy preserving natural boundaries), and semantic (sentence-level, falls back to recursive). Selected via `CHUNK_STRATEGY` config.
- **Content-hash deduplication** -- each chunk gets a deterministic ID from a SHA-256 hash of the source path plus chunk index, preventing duplicate entries on re-ingestion.
- **Score-threshold filtering** -- retrieval results below a configurable similarity threshold are discarded before reranking, reducing noise in the generation context.
- **Zod config validation** -- `loadConfig()` parses all environment variables against a typed schema with sensible defaults. Missing or invalid values throw immediately, not at query time.
- **Request timeouts** -- `LLM_REQUEST_TIMEOUT_MS` (120s by default) bounds every model call the gateway, bedrock, anthropic and openai providers make, so a hung connection fails into the provider's circuit breaker instead of holding the pipeline. A call has to finish its whole reply within the timeout, and the default covers 4096 tokens at about 34 tokens a second, four times the 1024-token `LLM_MAX_TOKENS` default, so a deployment that raises `LLM_MAX_TOKENS` past that raises the timeout with it. The gateway and bedrock providers give up on the whole call at it; the anthropic and openai clients give each attempt the full timeout and retry a timed-out attempt once, so an endpoint that never answers holds the pipeline for two timeouts plus the SDK's backoff. `loadConfig()` refuses a value that is not a whole number of milliseconds from 1 to 2147483647.
- **One LLM per configuration** -- generation builds the configured LLM once for each loaded configuration and reuses it for every query, so the provider's circuit breaker sees all of them.
- **Provider isolation** -- embedding and vector store providers expose narrow interfaces (`embed`/`embedBatch`, `addDocuments`/`search`). LLM providers handle only generation. No provider knows about another.

## Evals

Unit tests cover the code around the model. What the model does with a
retrieved passage is what the eval suite covers.

```bash
npm run eval
```

The runner ingests `src/eval/docs/` into a collection named for the configured
one with `-eval` appended, then puts each case in `src/eval/cases/` through
`query()` and checks its assertions against the answer and the passages that
reached the prompt. It calls the configured embedding, vector store and LLM
providers, so it costs money and is run deliberately rather than in CI.

Cases are data — one JSON file each, with a `kind`:

- **golden** — the answer the pipeline exists to produce, asserted specifically:
  the figure from the passage, and a citation a reader can follow back to it.
- **adversarial** — input trying to make it do something else. One of the eval
  documents carries a block forging the `--- Source: ... ---` delimiter
  `formatContext()` wraps passages in, and inside it a demand to discard the
  system prompt. The delimiter is plain characters and any document can contain
  them, so the case asserts the answer reports the planted text rather than
  obeying it.

`loadCases()` throws on an empty or unreadable corpus instead of returning an
empty list, and rejects a file it cannot parse or a case missing a kind, an
input or an assertion. An eval that runs nothing would otherwise print what an
eval that ran everything and passed prints.

Add a case by dropping a JSON file in `src/eval/cases/`. Assertion types are
`contains`, `not_contains`, `matches_pattern` (compiled case-insensitively),
`cites_source` (the answer names the document) and `retrieved_source` (the
document reached the prompt). Give every adversarial assertion a `why` — the
assertion is usually a refusal, and the value alone does not say what it is
refusing.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Point `MODEL_GATEWAY_ENDPOINT`, `MODEL_ROUTE` and `EMBEDDING_ROUTE` at the Platform's ModelGateway and the routes it maps to a chat and an embeddings model, with `EMBEDDING_DIMENSIONS` matching the embeddings route
- [ ] Choose a persistent vector store backend (pgvector, Qdrant, or Pinecone)
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Tune `CHUNK_SIZE` and `CHUNK_OVERLAP` for your document corpus
- [ ] Set `RETRIEVAL_SCORE_THRESHOLD` to filter low-relevance results
- [ ] Monitor embedding API costs -- batch size and document volume directly affect spend
- [ ] Run a test ingestion and verify retrieval quality before going live
- [ ] Set up alerting on ingestion failures and query latency

## Configuration

All settings are loaded from environment variables. See `.env.example` for the full list.
