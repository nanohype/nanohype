import type { SearchProvider } from "./types.js";
import type {
  SearchIndex,
  SearchDocument,
  SearchQuery,
  SearchResult,
  SearchHit,
  SearchConfig,
  FilterExpression,
} from "../types.js";
import { registerProvider } from "./registry.js";

// ── Mock Provider ─────────────────────────────────────────────────
//
// In-memory search provider with basic TF-IDF text matching and
// facet counting. Suitable for development and testing — no
// external dependencies or API keys required.
//
// Each factory call returns an independent instance with its own
// index and document stores.
//

function createMockProvider(): SearchProvider {
  const indices = new Map<string, SearchIndex>();
  const documents = new Map<string, Map<string, SearchDocument>>();

  /** Tokenize text into lowercase terms. */
  function tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter((t) => t.length > 0);
  }

  /** Compute term frequency for each term in tokens. */
  function termFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    // Normalize by document length
    for (const [term, count] of tf) {
      tf.set(term, count / tokens.length);
    }
    return tf;
  }

  /** Compute inverse document frequency for query terms across a corpus. */
  function inverseDocumentFrequency(
    queryTerms: string[],
    corpus: SearchDocument[],
  ): Map<string, number> {
    const idf = new Map<string, number>();
    const n = corpus.length;

    for (const term of queryTerms) {
      let docsWithTerm = 0;
      for (const doc of corpus) {
        const docTokens = tokenize(doc.content);
        if (docTokens.includes(term)) docsWithTerm++;
      }
      // IDF with smoothing to avoid division by zero
      idf.set(term, Math.log((n + 1) / (docsWithTerm + 1)) + 1);
    }

    return idf;
  }

  /** Score a document against a query using TF-IDF. */
  function tfidfScore(
    doc: SearchDocument,
    queryTerms: string[],
    idf: Map<string, number>,
  ): number {
    const docTokens = tokenize(doc.content);
    const tf = termFrequency(docTokens);
    let score = 0;
    for (const term of queryTerms) {
      const tfVal = tf.get(term) ?? 0;
      const idfVal = idf.get(term) ?? 0;
      score += tfVal * idfVal;
    }
    return score;
  }

  /** Evaluate a filter expression against a document. */
  function matchesFilter(doc: SearchDocument, filter: FilterExpression): boolean {
    if ("and" in filter) {
      return filter.and.every((f) => matchesFilter(doc, f));
    }
    if ("or" in filter) {
      return filter.or.some((f) => matchesFilter(doc, f));
    }

    const { field, operator, value } = filter;
    const docValue = doc.metadata[field];

    switch (operator) {
      case "=":
        return docValue === value;
      case "!=":
        return docValue !== value;
      case ">":
        return typeof docValue === "number" && typeof value === "number" && docValue > value;
      case ">=":
        return typeof docValue === "number" && typeof value === "number" && docValue >= value;
      case "<":
        return typeof docValue === "number" && typeof value === "number" && docValue < value;
      case "<=":
        return typeof docValue === "number" && typeof value === "number" && docValue <= value;
      case "in":
        return Array.isArray(value) && value.includes(docValue as string | number);
      default:
        return false;
    }
  }

  return {
    name: "mock",

    async init(_config: SearchConfig): Promise<void> {
      // No setup needed for in-memory provider
    },

    async createIndex(index: SearchIndex): Promise<void> {
      indices.set(index.name, index);
      if (!documents.has(index.name)) {
        documents.set(index.name, new Map());
      }
    },

    async indexDocuments(indexName: string, docs: SearchDocument[]): Promise<void> {
      let store = documents.get(indexName);
      if (!store) {
        store = new Map();
        documents.set(indexName, store);
      }
      for (const doc of docs) {
        store.set(doc.id, doc);
      }
    },

    async search(indexName: string, query: SearchQuery): Promise<SearchResult> {
      const start = performance.now();
      const store = documents.get(indexName);

      if (!store || store.size === 0) {
        return { hits: [], totalHits: 0, processingTimeMs: performance.now() - start };
      }

      let corpus = Array.from(store.values());

      // Apply filters
      if (query.filter) {
        corpus = corpus.filter((doc) => matchesFilter(doc, query.filter!));
      }

      // Score documents with TF-IDF
      const queryTerms = tokenize(query.query);
      const idf = inverseDocumentFrequency(queryTerms, corpus);

      const scored: Array<{ doc: SearchDocument; score: number }> = corpus
        .map((doc) => ({ doc, score: tfidfScore(doc, queryTerms, idf) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

      const totalHits = scored.length;
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 10;
      const page = scored.slice(offset, offset + limit);

      const hits: SearchHit[] = page.map(({ doc, score }) => {
        const highlights: Record<string, string[]> = {};
        if (query.highlightFields) {
          for (const field of query.highlightFields) {
            const text = field === "content" ? doc.content : String(doc.metadata[field] ?? "");
            if (text) {
              // Simple highlight: wrap matching terms in <em>
              let highlighted = text;
              for (const term of queryTerms) {
                const re = new RegExp(`(${term})`, "gi");
                highlighted = highlighted.replace(re, "<em>$1</em>");
              }
              if (highlighted !== text) {
                highlights[field] = [highlighted];
              }
            }
          }
        }

        return {
          id: doc.id,
          content: doc.content,
          score,
          highlights: Object.keys(highlights).length > 0 ? highlights : undefined,
          metadata: doc.metadata,
        };
      });

      // Compute facet counts
      let facetCounts: Record<string, Record<string, number>> | undefined;
      if (query.facets && query.facets.length > 0) {
        facetCounts = {};
        for (const facetField of query.facets) {
          const counts: Record<string, number> = {};
          // Count across all filtered documents, not just the page
          for (const { doc } of scored) {
            const val = doc.metadata[facetField];
            if (val !== undefined && val !== null) {
              const key = String(val);
              counts[key] = (counts[key] ?? 0) + 1;
            }
          }
          facetCounts[facetField] = counts;
        }
      }

      return {
        hits,
        totalHits,
        facetCounts,
        processingTimeMs: performance.now() - start,
      };
    },

    async deleteDocuments(indexName: string, ids: string[]): Promise<void> {
      const store = documents.get(indexName);
      if (store) {
        for (const id of ids) {
          store.delete(id);
        }
      }
    },

    async getIndex(indexName: string): Promise<SearchIndex | undefined> {
      return indices.get(indexName);
    },

    async deleteIndex(indexName: string): Promise<void> {
      indices.delete(indexName);
      documents.delete(indexName);
    },

    async close(): Promise<void> {
      indices.clear();
      documents.clear();
    },
  };
}

// Self-register factory
registerProvider("mock", createMockProvider);
