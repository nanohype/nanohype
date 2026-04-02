# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Copy .env.example and configure your API keys
cp .env.example .env

# Install dependencies
npm install

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
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
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
