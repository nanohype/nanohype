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

## Configuration

All settings are loaded from environment variables. See `.env.example` for the full list.
