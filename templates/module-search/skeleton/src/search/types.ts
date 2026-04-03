// ── Search Core Types ──────────────────────────────────────────────
//
// Shared interfaces for search indices, documents, queries, results,
// facets, and filter expressions. These are provider-agnostic — every
// backend implementation works against the same shapes.
//

export type { SearchProvider, SearchProviderFactory } from "./providers/types.js";

/** Schema definition for a search index. */
export interface SearchIndex {
  /** Unique index name. */
  name: string;

  /** Fields and their types for indexing. */
  fields: IndexField[];
}

/** A field within a search index schema. */
export interface IndexField {
  /** Field name. */
  name: string;

  /** Field type: "string", "number", "boolean", or "string[]". */
  type: "string" | "number" | "boolean" | "string[]";

  /** Whether this field is the primary key. Default: false. */
  primary?: boolean;

  /** Whether this field is facetable. Default: false. */
  facet?: boolean;

  /** Whether this field is sortable. Default: false. */
  sortable?: boolean;
}

/** A document to be indexed. */
export interface SearchDocument {
  /** Unique document identifier. */
  id: string;

  /** Text content for full-text search. */
  content: string;

  /** Arbitrary metadata for filtering, faceting, and retrieval. */
  metadata: Record<string, unknown>;
}

/** A search query against an index. */
export interface SearchQuery {
  /** The search text. */
  query: string;

  /** Maximum number of results to return. Default: 10. */
  limit?: number;

  /** Offset for pagination. Default: 0. */
  offset?: number;

  /** Filter expression to narrow results. */
  filter?: FilterExpression;

  /** Fields to facet on (returns value counts). */
  facets?: string[];

  /** Fields to search within. If omitted, searches all text fields. */
  searchFields?: string[];

  /** Fields to include in highlights. */
  highlightFields?: string[];
}

/** A single search hit. */
export interface SearchHit {
  /** Document identifier. */
  id: string;

  /** Text content of the matched document. */
  content: string;

  /** Relevance score (higher = more relevant). */
  score: number;

  /** Highlighted snippets keyed by field name. */
  highlights?: Record<string, string[]>;

  /** Metadata associated with the matched document. */
  metadata: Record<string, unknown>;
}

/** Result set from a search query. */
export interface SearchResult {
  /** Matched documents ordered by relevance. */
  hits: SearchHit[];

  /** Total number of matching documents (may exceed hits.length). */
  totalHits: number;

  /** Facet value counts keyed by field name. */
  facetCounts?: Record<string, Record<string, number>>;

  /** Time taken to process the query in milliseconds. */
  processingTimeMs: number;
}

/** Facet definition for a search query. */
export interface Facet {
  /** Field name to facet on. */
  field: string;

  /** Maximum number of facet values to return. */
  maxValues?: number;
}

/** A comparison filter on a single field. */
export interface ComparisonFilter {
  field: string;
  operator: "=" | "!=" | ">" | ">=" | "<" | "<=" | "in";
  value: string | number | boolean | Array<string | number>;
}

/** Logical AND of multiple filter expressions. */
export interface AndFilter {
  and: FilterExpression[];
}

/** Logical OR of multiple filter expressions. */
export interface OrFilter {
  or: FilterExpression[];
}

/** A filter expression — comparison, AND, or OR. */
export type FilterExpression = ComparisonFilter | AndFilter | OrFilter;

/** Configuration passed to createSearchClient. */
export interface SearchConfig {
  /** Provider-specific configuration values. */
  [key: string]: unknown;
}
