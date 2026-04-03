# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createSemanticCache } from "./semantic-cache/index.js";

const cache = await createSemanticCache({
  embeddingProvider: "__EMBEDDING_PROVIDER__",
  vectorBackend: "__VECTOR_BACKEND__",
  similarityThreshold: 0.92,
});

// Store a response
await cache.store("What is TypeScript?", "TypeScript is a typed superset of JavaScript.");

// Look it up semantically — similar prompts match
const hit = await cache.lookup("Tell me about TypeScript");
if (hit) {
  console.log(hit.response); // "TypeScript is a typed superset of JavaScript."
  console.log(hit.score);    // 0.97 (cosine similarity)
}

// Clean up
await cache.close();
```

## Embedding Providers

| Provider | Backend | Dimensions | Use Case |
|----------|---------|------------|----------|
| `openai` | OpenAI text-embedding-3-small | 1536 | Production |
| `mock` | Deterministic hash | 64 | Testing |

### OpenAI

Requires `OPENAI_API_KEY` in the environment. Uses text-embedding-3-small (1536 dimensions). API calls are wrapped in a circuit breaker that opens after 3 failures in 60 seconds.

```typescript
const cache = await createSemanticCache({
  embeddingProvider: "openai",
  vectorBackend: "memory",
});
```

### Mock

Deterministic hash-based embeddings for testing. Same input always produces the same 64-dimensional vector. No external dependencies.

```typescript
const cache = await createSemanticCache({
  embeddingProvider: "mock",
  vectorBackend: "memory",
});
```

## How Similarity Matching Works

When you call `cache.store(prompt, response)`, the cache:
1. Generates an embedding vector for the prompt using the configured provider
2. Stores the vector alongside the response and a TTL expiration timestamp

When you call `cache.lookup(prompt)`, the cache:
1. Generates an embedding for the query prompt
2. Computes cosine similarity against every stored vector
3. Returns the best match if its score exceeds the similarity threshold (default: 0.95)
4. Returns `undefined` if no match exceeds the threshold or all entries are expired

Cosine similarity measures the angle between two vectors:
- **1.0** = identical direction (exact semantic match)
- **0.0** = orthogonal (unrelated)
- **-1.0** = opposite direction

A threshold of **0.95** is conservative — it catches near-identical prompts. Lower it to **0.85--0.90** to match semantically similar but differently-worded prompts.

## Gateway Integration

The gateway adapter bridges this semantic cache into any LLM gateway that expects a `CachingStrategy` interface. The adapter uses structural typing (duck typing) so there is no import dependency on the gateway module.

```typescript
import { createSemanticCache } from "./semantic-cache/index.js";
import { createSemanticCacheStrategy } from "./semantic-cache/gateway-adapter.js";

const cache = await createSemanticCache({
  embeddingProvider: "openai",
  vectorBackend: "memory",
});

const strategy = createSemanticCacheStrategy(cache);

// Pass to your LLM gateway
// gateway.use(strategy);

// The adapter implements:
// - get(key, { prompt, model, ttl }) — semantic lookup by prompt
// - set(key, { body }, { prompt, model, ttl }) — store by prompt embedding
// - invalidate(key) — remove by entry id
// - close() — shut down the cache
```

## Custom Embedding Providers

Implement the `EmbeddingProvider` interface and register it:

```typescript
import { registerEmbeddingProvider } from "./semantic-cache/embedder/index.js";
import type { EmbeddingProvider } from "./semantic-cache/embedder/index.js";

const myProvider: EmbeddingProvider = {
  name: "my-embedder",
  dimensions: 768,
  async embed(text) { /* ... */ return vector; },
  async embedBatch(texts) { /* ... */ return vectors; },
};

registerEmbeddingProvider(myProvider);
```

## Custom Vector Store Backends

Implement the `VectorCacheStore` interface and register it:

```typescript
import { registerVectorStore } from "./semantic-cache/store/index.js";
import type { VectorCacheStore } from "./semantic-cache/store/index.js";

const myStore: VectorCacheStore = {
  name: "my-store",
  async init(config) { /* ... */ },
  async upsert(entry) { /* ... */ },
  async search(embedding, threshold) { /* ... */ return hit; },
  async delete(id) { /* ... */ },
  async count() { /* ... */ return n; },
  async close() { /* ... */ },
};

registerVectorStore(myStore);
```

## Architecture

- **Semantic cache facade** -- `createSemanticCache()` returns a high-level `SemanticCache` object that wraps an embedding provider and a vector store behind a `lookup` / `store` / `invalidate` / `close` API. Application code never touches embeddings or vector math directly.
- **Embedding provider registry with self-registration** -- each provider module (openai, mock) calls `registerEmbeddingProvider()` at import time. Adding a custom provider is one function call.
- **Vector store registry with self-registration** -- each store module (memory) calls `registerVectorStore()` at import time. Adding a custom backend (pgvector, Pinecone, Qdrant) follows the same pattern.
- **Cosine similarity search** -- the memory store computes cosine similarity between the query embedding and all stored vectors, returning the best match above the threshold. Expired entries are skipped and lazily pruned.
- **Circuit breaker on embedding calls** -- the OpenAI provider wraps API calls in a circuit breaker that opens after 3 failures within 60 seconds, preventing cascading failures when the embedding API is down.
- **Gateway adapter via structural typing** -- `createSemanticCacheStrategy()` wraps a `SemanticCache` in the `GatewayCachingStrategy` interface without importing the gateway module, keeping the semantic cache standalone.
- **Zod input validation** -- `createSemanticCache()` validates its configuration against a Zod schema before initializing providers, catching configuration errors at construction time.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any initialization.

## Production Readiness

- [ ] Set `OPENAI_API_KEY` environment variable for the OpenAI embedding provider
- [ ] Choose an appropriate similarity threshold (0.85--0.95) balancing hit rate vs precision
- [ ] Set TTL values that balance cache freshness with API cost savings
- [ ] Implement a persistent vector store backend (pgvector, Pinecone, Qdrant) for production -- the memory store loses data on restart
- [ ] Monitor cache hit/miss ratio and embedding latency via OTel metrics
- [ ] Consider embedding dimension reduction if storage or latency is a concern
- [ ] Test with representative prompts to validate threshold tuning
- [ ] Set `LOG_LEVEL=warn` for production

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

Apache-2.0
