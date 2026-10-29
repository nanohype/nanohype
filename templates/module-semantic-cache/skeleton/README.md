# **PROJECT_NAME**

**DESCRIPTION**

## Quick Start

```typescript
import { createSemanticCache } from "./semantic-cache/index.js";

const cache = await createSemanticCache({
  embeddingProvider: "__EMBEDDING_PROVIDER__", // defaults to "gateway"
  vectorBackend: "__VECTOR_BACKEND__", // defaults to "memory"
  similarityThreshold: 0.92,
});

// Store a response
await cache.store("What is TypeScript?", "TypeScript is a typed superset of JavaScript.");

// Look it up semantically — similar prompts match
const hit = await cache.lookup("Tell me about TypeScript");
if (hit) {
  console.log(hit.response); // "TypeScript is a typed superset of JavaScript."
  console.log(hit.score); // 0.97 (cosine similarity)
}

// Clean up
await cache.close();
```

## Embedding Providers

| Provider  | Backend                                  | Dimensions | Use Case                                      |
| --------- | ---------------------------------------- | ---------- | --------------------------------------------- |
| `gateway` | Platform ModelGateway (Titan Text v2)    | 1024       | On the nanohype substrate (default)           |
| `bedrock` | AWS Bedrock Titan Text v2, called direct | 1024       | Off the substrate, AWS credential chain       |
| `openai`  | OpenAI text-embedding-3-small            | 1536       | Off the substrate, with `IncludeKeyProviders` |
| `mock`    | Deterministic hash                       | 64         | Testing                                       |

### Gateway (default)

Calls the Platform's ModelGateway, the only route to a model on the nanohype substrate. The eks-agent-platform operator runs the gateway under the tenant's EKS Pod Identity, holding the Bedrock role, so the cache holds no model credential and sends none. `MODEL_GATEWAY_ENDPOINT` is the gateway root, as ModelGateway `status.endpoint` publishes it, and defaults to the Service the operator creates for the Platform named at scaffold time. Requests speak the OpenAI embeddings shape at `/v1/embeddings` and name the `EMBEDDING_ROUTE` route (`embeddings`), which the ModelGateway CR maps to a Bedrock model; the gateway embeds one input per request, so `embedBatch` sends one request per text. Every call carries an AbortSignal timeout (`EMBED_REQUEST_TIMEOUT_MS`, default 30s) and is wrapped in a circuit breaker, and a vector that is not 1024 wide fails the call.

```typescript
const cache = await createSemanticCache({
  embeddingProvider: "gateway", // the default — can be omitted
  vectorBackend: "memory",
});
```

### Bedrock

Uses Amazon Titan Text Embeddings v2 (`amazon.titan-embed-text-v2:0`, 1024 dimensions) over the AWS credential chain, no API keys, for a cache that runs off the substrate: an ECS task role, or a local AWS profile in dev. Every call carries an AbortSignal timeout (`EMBED_REQUEST_TIMEOUT_MS`, default 30s) and is wrapped in a circuit breaker; the Titan response is Zod-validated before use. Override the model with `BEDROCK_EMBEDDING_MODEL`.

```typescript
const cache = await createSemanticCache({
  embeddingProvider: "bedrock",
  vectorBackend: "memory",
});
```

Bedrock needs model access to Titan Embed v2 in the deployment region (set `AWS_REGION`).

### OpenAI

Part of a project scaffolded with `IncludeKeyProviders`. Requires `OPENAI_API_KEY` in the environment, which the LLM policy permits only off the substrate, for a provider the intake brief names, read from the environment or the OS keychain and never committed. Uses text-embedding-3-small (1536 dimensions). The SDK client carries a request timeout (`EMBED_REQUEST_TIMEOUT_MS`, default 30s) and bounded retries, and calls are wrapped in a circuit breaker that opens after 3 failures in 60 seconds.

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

Don't guess — tune it empirically with the **threshold sweep** (`src/semantic-cache/threshold-sweep.ts`). Feed it a labeled validation set (query/candidate pairs tagged same-intent or not) and it reports hit / false-hit / miss rates at each candidate threshold and recommends the lowest one whose false-hit rate stays under tolerance — so you capture the most paraphrases without serving answers to _different_ questions:

```ts
import { sweepThresholds, renderSweepMarkdown } from "./semantic-cache/threshold-sweep.js";

const report = sweepThresholds(validationSamples); // [{ similarity, sameIntent }, ...]
console.log(renderSweepMarkdown(report)); // → recommended similarityThreshold + the supporting table
```

## Gateway Integration

The gateway adapter bridges this semantic cache into any LLM gateway that expects a `CachingStrategy` interface. The adapter uses structural typing (duck typing) so there is no import dependency on the gateway module.

```typescript
import { createSemanticCache } from "./semantic-cache/index.js";
import { createSemanticCacheStrategy } from "./semantic-cache/gateway-adapter.js";

const cache = await createSemanticCache({
  embeddingProvider: "gateway",
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

Implement the `EmbeddingProvider` interface and register a factory under a name. The factory runs on every `createSemanticCache()`, so each cache gets a fresh provider instance (its own SDK client and circuit breaker):

```typescript
import { registerEmbeddingProvider } from "./semantic-cache/embedder/index.js";
import type { EmbeddingProvider } from "./semantic-cache/embedder/index.js";

registerEmbeddingProvider(
  "my-embedder",
  (): EmbeddingProvider => ({
    name: "my-embedder",
    dimensions: 768,
    async embed(text) {
      /* ... */ return vector;
    },
    async embedBatch(texts) {
      /* ... */ return vectors;
    },
  }),
);
```

## Custom Vector Store Backends

Implement the `VectorCacheStore` interface and register a factory under a name. The factory runs on every `createSemanticCache()`, so each cache gets its own isolated backend instance:

```typescript
import { registerVectorStore } from "./semantic-cache/store/index.js";
import type { VectorCacheStore } from "./semantic-cache/store/index.js";

registerVectorStore(
  "my-store",
  (): VectorCacheStore => ({
    name: "my-store",
    async init(config) {
      /* ... */
    },
    async upsert(entry) {
      /* ... */
    },
    async search(embedding, threshold) {
      /* ... */ return hit;
    },
    async delete(id) {
      /* ... */
    },
    async count() {
      /* ... */ return n;
    },
    async close() {
      /* ... */
    },
  }),
);
```

## Architecture

- **Semantic cache facade** -- `createSemanticCache()` returns a high-level `SemanticCache` object that wraps an embedding provider and a vector store behind a `lookup` / `store` / `invalidate` / `close` API. Application code never touches embeddings or vector math directly.
- **Embedding provider registry with factory self-registration** -- each provider module (gateway, bedrock, openai, mock) calls `registerEmbeddingProvider(name, factory)` at import time. The factory runs on each `createSemanticCache()`, so every cache gets a fresh provider with its own SDK client and circuit breaker. Adding a custom provider is one function call.
- **Vector store registry with factory self-registration** -- each store module (memory) calls `registerVectorStore(name, factory)` at import time. Each `createSemanticCache()` gets its own isolated backend. Adding a custom backend (pgvector, Pinecone, Qdrant) follows the same pattern.
- **Cosine similarity search** -- the memory store computes cosine similarity between the query embedding and all stored vectors, returning the best match above the threshold. Expired entries are skipped and lazily pruned; the store is bounded by `maxEntries` with LRU-style eviction.
- **Circuit breaker + timeouts on embedding calls** -- the gateway and Bedrock providers send each call with an AbortSignal timeout and Zod-validate the response; the OpenAI provider sets an SDK request timeout with bounded retries. All three wrap calls in a circuit breaker that opens after repeated failures, preventing cascades when the embedding API is down.
- **Gateway adapter via structural typing** -- `createSemanticCacheStrategy()` wraps a `SemanticCache` in the `GatewayCachingStrategy` interface without importing the gateway module, keeping the semantic cache standalone.
- **Zod input validation** -- `createSemanticCache()` validates its configuration against a Zod schema before initializing providers, catching configuration errors at construction time.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any initialization.

## Production Readiness

- [ ] Confirm the Platform's ModelGateway serves the `EMBEDDING_ROUTE` route at 1024 dimensions; off the substrate, grant Bedrock model access to Titan Embed v2 and set `AWS_REGION`, or read the `OPENAI_API_KEY` the intake brief names from the environment or the OS keychain
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
