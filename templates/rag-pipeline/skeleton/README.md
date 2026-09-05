# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Copy .env.example and configure your API keys
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

- **LLM**: Anthropic (Claude), OpenAI (GPT)
- **Embedding**: OpenAI, Cohere
- **Vector store**: Chroma, pgvector, Qdrant, Pinecone

### Design Decisions

- **Four-stage pipeline** -- ingest, chunk, embed, store are discrete stages that compose into a single `ingestDirectory()` call. The query path mirrors this: embed query, search store, filter, rerank, generate.
- **Triple registry pattern** -- LLM, embedding, and vector store providers each self-register on import. Swapping a backend is one environment variable change; the registry resolves the correct factory at runtime.
- **Pluggable chunking strategies** -- fixed (token-count heuristic), recursive (separator hierarchy preserving natural boundaries), and semantic (sentence-level, falls back to recursive). Selected via `CHUNK_STRATEGY` config.
- **Content-hash deduplication** -- each chunk gets a deterministic ID from a SHA-256 hash of the source path plus chunk index, preventing duplicate entries on re-ingestion.
- **Score-threshold filtering** -- retrieval results below a configurable similarity threshold are discarded before reranking, reducing noise in the generation context.
- **Zod config validation** -- `loadConfig()` parses all environment variables against a typed schema with sensible defaults. Missing or invalid values throw immediately, not at query time.
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
- [ ] Configure production API keys for your LLM and embedding providers
- [ ] Choose a persistent vector store backend (pgvector, Qdrant, or Pinecone)
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Tune `CHUNK_SIZE` and `CHUNK_OVERLAP` for your document corpus
- [ ] Set `RETRIEVAL_SCORE_THRESHOLD` to filter low-relevance results
- [ ] Monitor embedding API costs -- batch size and document volume directly affect spend
- [ ] Run a test ingestion and verify retrieval quality before going live
- [ ] Set up alerting on ingestion failures and query latency

## Configuration

All settings are loaded from environment variables. See `.env.example` for the full list.
