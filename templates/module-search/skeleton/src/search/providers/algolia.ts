import type { SearchProvider } from "./types.js";
import type {
  SearchIndex,
  SearchDocument,
  SearchQuery,
  SearchResult,
  SearchConfig,
  FilterExpression,
} from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { logger } from "../logger.js";

// ── Algolia Provider ──────────────────────────────────────────────
//
// Algolia REST API via native fetch. Each factory call returns a new
// instance with its own lazily-resolved config and circuit breaker.
// Supports batch indexing, faceted search, and filter expressions.
//
// Auth: ALGOLIA_APP_ID + ALGOLIA_API_KEY environment variables.
//

function createAlgoliaProvider(): SearchProvider {
  let appId = "";
  let apiKey = "";
  const cb = createCircuitBreaker();
  const indexSchemas = new Map<string, SearchIndex>();

  function baseUrl(): string {
    return `https://${appId}-dsn.algolia.net/1`;
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${baseUrl()}${path}`;
    const response = await cb.execute(() =>
      fetch(url, {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: {
          "X-Algolia-Application-Id": appId,
          "X-Algolia-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Algolia ${method} ${path} failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  function compileFilter(expr: FilterExpression): string {
    if ("and" in expr) {
      return expr.and.map(compileFilter).map((s) => `(${s})`).join(" AND ");
    }
    if ("or" in expr) {
      return expr.or.map(compileFilter).map((s) => `(${s})`).join(" OR ");
    }
    const { field, operator, value } = expr;
    if (operator === "in" && Array.isArray(value)) {
      return value.map((v) => `${field}:${JSON.stringify(v)}`).join(" OR ");
    }
    if (operator === "=" || operator === "==") {
      return `${field}:${JSON.stringify(value)}`;
    }
    if (operator === "!=") {
      return `NOT ${field}:${JSON.stringify(value)}`;
    }
    return `${field} ${operator} ${value}`;
  }

  return {
    name: "algolia",

    async init(config: SearchConfig): Promise<void> {
      appId = (config.appId as string) ?? process.env.ALGOLIA_APP_ID ?? "";
      apiKey = (config.apiKey as string) ?? process.env.ALGOLIA_API_KEY ?? "";
      if (!appId || !apiKey) {
        throw new Error("Algolia requires appId and apiKey (config or ALGOLIA_APP_ID/ALGOLIA_API_KEY env vars)");
      }
      logger.info("algolia provider initialized", { appId });
    },

    async createIndex(index: SearchIndex): Promise<void> {
      const facetFields = index.fields.filter((f) => f.facet).map((f) => f.name);
      const sortableFields = index.fields.filter((f) => f.sortable).map((f) => f.name);

      await request("PUT", `/indexes/${index.name}/settings`, {
        searchableAttributes: index.fields
          .filter((f) => f.type === "string" || f.type === "string[]")
          .map((f) => f.name),
        attributesForFaceting: facetFields.map((f) => `filterOnly(${f})`),
        sortableAttributes: sortableFields,
      });

      indexSchemas.set(index.name, index);
      logger.info("algolia index created", { index: index.name });
    },

    async indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void> {
      const objects = documents.map((doc) => ({
        objectID: doc.id,
        content: doc.content,
        ...doc.metadata,
      }));

      // Algolia batch indexing
      await request("POST", `/indexes/${indexName}/batch`, {
        requests: objects.map((obj) => ({
          action: "updateObject",
          body: obj,
        })),
      });

      logger.debug("algolia documents indexed", { index: indexName, count: documents.length });
    },

    async search(indexName: string, query: SearchQuery): Promise<SearchResult> {
      const start = performance.now();

      const params: Record<string, unknown> = {
        query: query.query,
        hitsPerPage: query.limit ?? 10,
        page: Math.floor((query.offset ?? 0) / (query.limit ?? 10)),
      };

      if (query.filter) {
        params.filters = compileFilter(query.filter);
      }

      if (query.facets && query.facets.length > 0) {
        params.facets = query.facets;
      }

      if (query.highlightFields) {
        params.attributesToHighlight = query.highlightFields;
      }

      const result = await request("POST", `/indexes/${indexName}/query`, params) as Record<string, unknown>;
      const processingTimeMs = performance.now() - start;

      const hits = ((result.hits as Record<string, unknown>[]) ?? []).map((hit, i) => ({
        id: (hit.objectID as string) ?? "",
        content: (hit.content as string) ?? "",
        score: 1 / (1 + i), // Algolia does not return raw scores
        highlights: hit._highlightResult
          ? extractHighlights(hit._highlightResult as Record<string, unknown>)
          : undefined,
        metadata: Object.fromEntries(
          Object.entries(hit).filter(
            ([k]) => !["objectID", "content", "_highlightResult", "_rankingInfo"].includes(k),
          ),
        ),
      }));

      const facetCounts = result.facets
        ? (result.facets as Record<string, Record<string, number>>)
        : undefined;

      return {
        hits,
        totalHits: (result.nbHits as number) ?? hits.length,
        facetCounts,
        processingTimeMs,
      };
    },

    async deleteDocuments(indexName: string, ids: string[]): Promise<void> {
      await request("POST", `/indexes/${indexName}/batch`, {
        requests: ids.map((id) => ({
          action: "deleteObject",
          body: { objectID: id },
        })),
      });
    },

    async getIndex(indexName: string): Promise<SearchIndex | undefined> {
      return indexSchemas.get(indexName);
    },

    async deleteIndex(indexName: string): Promise<void> {
      await request("DELETE", `/indexes/${indexName}`);
      indexSchemas.delete(indexName);
    },

    async close(): Promise<void> {
      indexSchemas.clear();
    },
  };
}

function extractHighlights(
  highlightResult: Record<string, unknown>,
): Record<string, string[]> {
  const highlights: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(highlightResult)) {
    if (val && typeof val === "object" && "value" in (val as Record<string, unknown>)) {
      const value = (val as Record<string, unknown>).value as string;
      if (value) highlights[key] = [value];
    }
  }
  return highlights;
}

// Self-register factory
registerProvider("algolia", createAlgoliaProvider);
