// ── Knowledge Base Types ────────────────────────────────────────────
//
// Core types for the knowledge base module. All providers normalize
// their native formats to these structures. Page content is always
// markdown, regardless of the underlying platform.
//

/** Block types that can appear within a page. */
export type BlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list"
  | "numbered_list"
  | "code"
  | "image"
  | "divider"
  | "quote"
  | "table";

/** A structural block within a page. */
export interface Block {
  /** Block type identifier. */
  type: BlockType;

  /** Text content of the block (empty for dividers, images use URL). */
  content: string;

  /** Programming language for code blocks. */
  language?: string;

  /** Image URL for image blocks. */
  url?: string;

  /** Alt text for image blocks. */
  alt?: string;

  /** Nested child blocks (e.g. toggle list children). */
  children?: Block[];

  /** Table rows for table blocks. Each row is an array of cell strings. */
  rows?: string[][];
}

/** A normalized knowledge base page. */
export interface Page {
  /** Unique page identifier from the provider. */
  id: string;

  /** Page title. */
  title: string;

  /** Page content normalized to markdown. */
  content: string;

  /** Provider-specific metadata. */
  metadata: Record<string, unknown>;

  /** URL to view the page in the provider's UI. */
  url: string;

  /** Last modification timestamp. */
  updatedAt: Date;
}

/** Payload for creating a new page. */
export interface PageCreate {
  /** Page title. */
  title: string;

  /** Markdown content for the page body. */
  content: string;

  /** Parent page or database/space ID. */
  parentId?: string;

  /** Additional metadata to attach. */
  metadata?: Record<string, unknown>;
}

/** Payload for updating an existing page. */
export interface PageUpdate {
  /** New title (omit to keep existing). */
  title?: string;

  /** New markdown content (omit to keep existing). */
  content?: string;

  /** Additional metadata to merge. */
  metadata?: Record<string, unknown>;
}

/** Options for searching pages. */
export interface SearchOptions {
  /** Search query string. */
  query: string;

  /** Maximum number of results to return. */
  limit?: number;

  /** Filter to a specific parent page or database. */
  parentId?: string;
}

/** Options for listing pages. */
export interface ListOptions {
  /** Maximum number of results per page. */
  pageSize?: number;

  /** Cursor for pagination (from a previous PaginatedResult). */
  cursor?: string;

  /** Filter to a specific parent page or database. */
  parentId?: string;
}

/** A paginated result set. */
export interface PaginatedResult<T> {
  /** Items in this page of results. */
  items: T[];

  /** Cursor to fetch the next page. Undefined when no more results. */
  nextCursor?: string;

  /** Whether there are more results after this page. */
  hasMore: boolean;
}
