// ── Knowledge Provider Interface ────────────────────────────────────
//
// Every knowledge base provider implements this interface. The registry
// stores provider factories -- each call to getProvider() returns a
// fresh instance with its own circuit breaker and API client state.
//
// No module-level mutable state: API clients are lazily initialized
// inside each factory closure, and circuit breakers are per-instance.
//

import type {
  Page,
  Block,
  PageCreate,
  PageUpdate,
  SearchOptions,
  ListOptions,
  PaginatedResult,
} from "../types.js";

/** Provider factory -- returns a new KnowledgeProvider instance each time. */
export type KnowledgeProviderFactory = () => KnowledgeProvider;

export interface KnowledgeProvider {
  /** Unique provider name (e.g. "notion", "confluence", "google-docs"). */
  readonly name: string;

  /** Retrieve a single page by ID. */
  getPage(pageId: string): Promise<Page>;

  /** Create a new page. */
  createPage(data: PageCreate): Promise<Page>;

  /** Update an existing page. */
  updatePage(pageId: string, data: PageUpdate): Promise<Page>;

  /** Search pages by query. */
  searchPages(options: SearchOptions): Promise<PaginatedResult<Page>>;

  /** List pages with pagination. */
  listPages(options?: ListOptions): Promise<PaginatedResult<Page>>;

  /** Get the block structure of a page. */
  getBlocks(pageId: string): Promise<Block[]>;
}
