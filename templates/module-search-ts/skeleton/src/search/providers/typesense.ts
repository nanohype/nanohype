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

// ── Typesense Provider ────────────────────────────────────────────
//
// Typesense HTTP API via native fetch. Each factory call returns a
// new instance with its own lazily-resolved config and circuit
// breaker. Supports auto-schema detection and multi-search.
//
// Auth: TYPESENSE_URL + TYPESENSE_API_KEY environment variables.
//

function createTypesenseProvider(): SearchProvider {
  let baseUrl = "";
  let apiKey = "";
  const cb = createCircuitBreaker();
  const indexSchemas = new Map<string, SearchIndex>();

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const response = await cb.execute(() =>
      fetch(url, {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: {
          "X-TYPESENSE-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Typesense ${method} ${path} failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  function fieldTypeToTypesense(type: string): string {
    switch (type) {
      case "number": return "float";
      case "boolean": return "bool";
      case "string[]": return "string[]";
      default: return "string";
    }
  }

  function compileFilter(expr: FilterExpression): string {
    if ("and" in expr) {
      return expr.and.map(compileFilter).join(" && ");
    }
    if ("or" in expr) {
      return expr.or.map(compileFilter).map((s) => `(${s})`).join(" || ");
    }
    const { field, operator, value } = expr;
    if (operator === "in" && Array.isArray(value)) {
      return `${field}:[${value.map((v) => JSON.stringify(v)).join(",")}]`;
    }
    const op = operator === "=" ? ":=" : operator === "!=" ? ":!=" : operator;
    return `${field}${op}${JSON.stringify(value)}`;
  }

  return {
    name: "typesense",

    async init(config: SearchConfig): Promise<void> {
      baseUrl = ((config.url as string) ?? process.env.TYPESENSE_URL ?? "http://localhost:8108").replace(/\/$/, "");
      apiKey = (config.apiKey as string) ?? process.env.TYPESENSE_API_KEY ?? "";
      if (!apiKey) {
        throw new Error("Typesense requires apiKey (config or TYPESENSE_API_KEY env var)");
      }
      logger.info("typesense provider initialized", { url: baseUrl });
    },

    async createIndex(index: SearchIndex): Promise<void> {
      const schema = {
        name: index.name,
        fields: index.fields.map((f) => ({
          name: f.name,
          type: fieldTypeToTypesense(f.type),
          facet: f.facet ?? false,
          sort: f.sortable ?? false,
        })),
      };

      await request("POST", "/collections", schema);
      indexSchemas.set(index.name, index);
      logger.info("typesense index created", { index: index.name });
    },

    async indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void> {
      // Typesense import uses JSONL format
      const lines = documents.map((doc) =>
        JSON.stringify({ id: doc.id, content: doc.content, ...doc.metadata }),
      ).join("\n");

      const url = `${baseUrl}/collections/${indexName}/documents/import?action=upsert`;
      const response = await cb.execute(() =>
        fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "X-TYPESENSE-API-KEY": apiKey,
            "Content-Type": "text/plain",
          },
          body: lines,
        }),
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Typesense import failed (${response.status}): ${text}`);
      }

      logger.debug("typesense documents indexed", { index: indexName, count: documents.length });
    },

    async search(indexName: string, query: SearchQuery): Promise<SearchResult> {
      const start = performance.now();

      const params = new URLSearchParams({
        q: query.query,
        query_by: query.searchFields?.join(",") ?? "content",
        per_page: String(query.limit ?? 10),
        page: String(Math.floor((query.offset ?? 0) / (query.limit ?? 10)) + 1),
      });

      if (query.filter) {
        params.set("filter_by", compileFilter(query.filter));
      }

      if (query.facets && query.facets.length > 0) {
        params.set("facet_by", query.facets.join(","));
      }

      if (query.highlightFields) {
        params.set("highlight_fields", query.highlightFields.join(","));
      }

      const result = await request(
        "GET",
        `/collections/${indexName}/documents/search?${params.toString()}`,
      ) as Record<string, unknown>;

      const processingTimeMs = performance.now() - start;
      const rawHits = (result.hits as Array<Record<string, unknown>>) ?? [];

      const hits = rawHits.map((hit) => {
        const doc = hit.document as Record<string, unknown>;
        const highlightArr = hit.highlights as Array<Record<string, unknown>> | undefined;

        const highlights: Record<string, string[]> = {};
        if (highlightArr) {
          for (const h of highlightArr) {
            const field = h.field as string;
            const snippets = h.snippets as string[] | undefined;
            if (field && snippets) highlights[field] = snippets;
          }
        }

        return {
          id: (doc.id as string) ?? "",
          content: (doc.content as string) ?? "",
          score: (hit.text_match_info as Record<string, unknown>)?.score as number ?? 0,
          highlights: Object.keys(highlights).length > 0 ? highlights : undefined,
          metadata: Object.fromEntries(
            Object.entries(doc).filter(([k]) => !["id", "content"].includes(k)),
          ),
        };
      });

      let facetCounts: Record<string, Record<string, number>> | undefined;
      const rawFacets = result.facet_counts as Array<Record<string, unknown>> | undefined;
      if (rawFacets && rawFacets.length > 0) {
        facetCounts = {};
        for (const fc of rawFacets) {
          const field = fc.field_name as string;
          const counts = fc.counts as Array<{ value: string; count: number }>;
          facetCounts[field] = {};
          for (const c of counts) {
            facetCounts[field][c.value] = c.count;
          }
        }
      }

      return {
        hits,
        totalHits: (result.found as number) ?? hits.length,
        facetCounts,
        processingTimeMs,
      };
    },

    async deleteDocuments(indexName: string, ids: string[]): Promise<void> {
      for (const id of ids) {
        await request("DELETE", `/collections/${indexName}/documents/${id}`);
      }
    },

    async getIndex(indexName: string): Promise<SearchIndex | undefined> {
      return indexSchemas.get(indexName);
    },

    async deleteIndex(indexName: string): Promise<void> {
      await request("DELETE", `/collections/${indexName}`);
      indexSchemas.delete(indexName);
    },

    async close(): Promise<void> {
      indexSchemas.clear();
    },
  };
}

// Self-register factory
registerProvider("typesense", createTypesenseProvider);
