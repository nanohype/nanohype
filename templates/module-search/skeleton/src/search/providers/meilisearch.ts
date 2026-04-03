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

// ── Meilisearch Provider ──────────────────────────────────────────
//
// Meilisearch HTTP API via native fetch. Each factory call returns a
// new instance with its own lazily-resolved config and circuit
// breaker. Supports async indexing with task polling.
//
// Auth: MEILISEARCH_URL + MEILISEARCH_MASTER_KEY environment variables.
//

function createMeilisearchProvider(): SearchProvider {
  let baseUrl = "";
  let masterKey = "";
  const cb = createCircuitBreaker();
  const indexSchemas = new Map<string, SearchIndex>();

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (masterKey) {
      headers["Authorization"] = `Bearer ${masterKey}`;
    }

    const response = await cb.execute(() =>
      fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meilisearch ${method} ${path} failed (${response.status}): ${text}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return undefined;
  }

  async function waitForTask(taskUid: number, maxWaitMs: number = 30_000): Promise<void> {
    const start = Date.now();
    const pollInterval = 100;

    while (Date.now() - start < maxWaitMs) {
      const task = await request("GET", `/tasks/${taskUid}`) as Record<string, unknown>;
      const status = task.status as string;

      if (status === "succeeded") return;
      if (status === "failed") {
        throw new Error(`Meilisearch task ${taskUid} failed: ${JSON.stringify(task.error)}`);
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error(`Meilisearch task ${taskUid} timed out after ${maxWaitMs}ms`);
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
      return `${field} IN [${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    return `${field} ${operator} ${JSON.stringify(value)}`;
  }

  return {
    name: "meilisearch",

    async init(config: SearchConfig): Promise<void> {
      baseUrl = ((config.url as string) ?? process.env.MEILISEARCH_URL ?? "http://localhost:7700").replace(/\/$/, "");
      masterKey = (config.masterKey as string) ?? process.env.MEILISEARCH_MASTER_KEY ?? "";
      logger.info("meilisearch provider initialized", { url: baseUrl });
    },

    async createIndex(index: SearchIndex): Promise<void> {
      const primaryField = index.fields.find((f) => f.primary);
      const result = await request("POST", "/indexes", {
        uid: index.name,
        primaryKey: primaryField?.name ?? "id",
      }) as Record<string, unknown>;

      if (result && typeof result === "object" && "taskUid" in result) {
        await waitForTask(result.taskUid as number);
      }

      // Configure filterable and sortable attributes
      const filterableFields = index.fields
        .filter((f) => f.facet)
        .map((f) => f.name);
      const sortableFields = index.fields
        .filter((f) => f.sortable)
        .map((f) => f.name);

      if (filterableFields.length > 0) {
        const task = await request("PUT", `/indexes/${index.name}/settings/filterable-attributes`, filterableFields) as Record<string, unknown>;
        if (task && "taskUid" in task) await waitForTask(task.taskUid as number);
      }

      if (sortableFields.length > 0) {
        const task = await request("PUT", `/indexes/${index.name}/settings/sortable-attributes`, sortableFields) as Record<string, unknown>;
        if (task && "taskUid" in task) await waitForTask(task.taskUid as number);
      }

      indexSchemas.set(index.name, index);
      logger.info("meilisearch index created", { index: index.name });
    },

    async indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void> {
      const docs = documents.map((doc) => ({
        id: doc.id,
        content: doc.content,
        ...doc.metadata,
      }));

      const result = await request("POST", `/indexes/${indexName}/documents`, docs) as Record<string, unknown>;
      if (result && "taskUid" in result) {
        await waitForTask(result.taskUid as number);
      }

      logger.debug("meilisearch documents indexed", { index: indexName, count: documents.length });
    },

    async search(indexName: string, query: SearchQuery): Promise<SearchResult> {
      const start = performance.now();

      const body: Record<string, unknown> = {
        q: query.query,
        limit: query.limit ?? 10,
        offset: query.offset ?? 0,
      };

      if (query.filter) {
        body.filter = compileFilter(query.filter);
      }

      if (query.facets && query.facets.length > 0) {
        body.facets = query.facets;
      }

      if (query.highlightFields) {
        body.attributesToHighlight = query.highlightFields;
      }

      const result = await request("POST", `/indexes/${indexName}/search`, body) as Record<string, unknown>;
      const processingTimeMs = performance.now() - start;

      const rawHits = (result.hits as Array<Record<string, unknown>>) ?? [];
      const hits = rawHits.map((hit, i) => {
        const formatted = hit._formatted as Record<string, unknown> | undefined;
        const highlights: Record<string, string[]> = {};

        if (formatted && query.highlightFields) {
          for (const field of query.highlightFields) {
            const val = formatted[field];
            if (typeof val === "string") {
              highlights[field] = [val];
            }
          }
        }

        return {
          id: (hit.id as string) ?? "",
          content: (hit.content as string) ?? "",
          score: 1 / (1 + i), // Meilisearch does not expose raw scores
          highlights: Object.keys(highlights).length > 0 ? highlights : undefined,
          metadata: Object.fromEntries(
            Object.entries(hit).filter(
              ([k]) => !["id", "content", "_formatted", "_rankingInfo"].includes(k),
            ),
          ),
        };
      });

      let facetCounts: Record<string, Record<string, number>> | undefined;
      const rawDistribution = result.facetDistribution as Record<string, Record<string, number>> | undefined;
      if (rawDistribution && Object.keys(rawDistribution).length > 0) {
        facetCounts = rawDistribution;
      }

      return {
        hits,
        totalHits: (result.estimatedTotalHits as number) ?? hits.length,
        facetCounts,
        processingTimeMs,
      };
    },

    async deleteDocuments(indexName: string, ids: string[]): Promise<void> {
      const result = await request("POST", `/indexes/${indexName}/documents/delete-batch`, ids) as Record<string, unknown>;
      if (result && "taskUid" in result) {
        await waitForTask(result.taskUid as number);
      }
    },

    async getIndex(indexName: string): Promise<SearchIndex | undefined> {
      return indexSchemas.get(indexName);
    },

    async deleteIndex(indexName: string): Promise<void> {
      const result = await request("DELETE", `/indexes/${indexName}`) as Record<string, unknown>;
      if (result && "taskUid" in result) {
        await waitForTask(result.taskUid as number);
      }
      indexSchemas.delete(indexName);
    },

    async close(): Promise<void> {
      indexSchemas.clear();
    },
  };
}

// Self-register factory
registerProvider("meilisearch", createMeilisearchProvider);
