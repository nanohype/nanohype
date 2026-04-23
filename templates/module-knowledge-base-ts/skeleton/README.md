# __PROJECT_NAME__

__DESCRIPTION__

Knowledge base module with pluggable providers. All providers normalize content to markdown. Supports Notion, Confluence, Google Docs, and Coda out of the box.

## Quick Start

```typescript
import { createKnowledgeClient } from "./knowledge-base/index.js";

// Create a client with the default provider (__PROVIDER__)
const kb = await createKnowledgeClient({
  provider: "__PROVIDER__",
});

// Search pages
const results = await kb.searchPages({ query: "onboarding" });

// Get a page (content is always markdown)
const page = await kb.getPage("page-id");
console.log(page.content); // "# Welcome\n\nThis is the onboarding guide..."

// Create a page
const newPage = await kb.createPage({
  title: "New Guide",
  content: "# New Guide\n\nContent here...",
  parentId: "parent-page-id",
});

// List pages with pagination
const { items, nextCursor } = await kb.listPages({
  pageSize: 20,
});
```

## Providers

### Notion

```typescript
const kb = await createKnowledgeClient({
  provider: "notion",
  // Reads NOTION_TOKEN from environment
});
```

### Confluence

```typescript
const kb = await createKnowledgeClient({
  provider: "confluence",
  // Reads CONFLUENCE_EMAIL, CONFLUENCE_TOKEN, CONFLUENCE_BASE_URL
});
```

### Google Docs

```typescript
const kb = await createKnowledgeClient({
  provider: "google-docs",
  // Reads GOOGLE_DOCS_TOKEN from environment
});
```

### Coda

```typescript
const kb = await createKnowledgeClient({
  provider: "coda",
  // Reads CODA_TOKEN from environment
});
```

### Mock (testing)

```typescript
const kb = await createKnowledgeClient({
  provider: "mock",
});
```

## Data Pipeline Integration

The IngestSource adapter bridges knowledge base pages into a data-pipeline workflow:

```typescript
import { createKnowledgeIngestSource } from "./knowledge-base/ingest/adapter.js";

const source = createKnowledgeIngestSource("notion", {
  parentId: "database-id", // optional: scope to a parent page or database
});

const documents = await source.load("knowledge-base://notion");
// Each document has: id, content (markdown), metadata (provider, pageId, url)
```

## Custom Providers

Implement the `KnowledgeProvider` interface and register the factory:

```typescript
import { registerProvider } from "./knowledge-base/providers/registry.js";
import type { KnowledgeProvider } from "./knowledge-base/providers/types.js";

function createMyProvider(): KnowledgeProvider {
  return {
    name: "my-provider",
    // ... implement all methods
  };
}

registerProvider("my-provider", createMyProvider);
```

## Architecture

- **Factory-based registry** -- `getProvider()` returns a new instance each time, with its own circuit breaker and API client state. No shared mutable state between callers.
- **Markdown normalization** -- every provider converts its native format (Notion blocks, Confluence storage format, Google Docs JSON, Coda docs) to markdown. `Page.content` is always a markdown string.
- **Native fetch** -- all providers use the built-in `fetch` API. No provider-specific SDKs.
- **Circuit breakers per instance** -- each provider instance has its own circuit breaker, preventing cascading failures.
- **IngestSource adapter** -- bridges knowledge base pages into the data-pipeline `Document[]` format for ingestion workflows.
- **OTel metrics** -- tracks `knowledge_base_request_total` and `knowledge_base_duration_ms` per provider and operation.
- **Zod input validation** -- `createKnowledgeClient()` validates configuration at construction time.

## Production Readiness

- [ ] Set provider-specific environment variables (tokens, URLs)
- [ ] Choose appropriate provider for your knowledge base platform
- [ ] Configure rate limiting for API calls (providers have their own limits)
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor request rates and latency via OTel metrics
- [ ] Handle pagination for large knowledge bases

## Requirements

- Node.js >= 22
- TypeScript >= 5.8
