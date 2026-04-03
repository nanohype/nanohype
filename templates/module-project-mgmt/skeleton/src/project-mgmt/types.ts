// ── Project Management Core Types ──────────────────────────────────
//
// Shared interfaces for the project management module. These are the
// canonical types that every provider, adapter, and consumer works
// against. Provider-agnostic — implementations map their native
// formats into these common shapes.
//

/** Unified priority levels across all providers. */
export type Priority = "urgent" | "high" | "medium" | "low" | "none";

/** A project (container for issues). */
export interface Project {
  /** Provider-assigned unique identifier. */
  id: string;
  /** Human-readable project name. */
  name: string;
  /** Optional project description. */
  description?: string;
  /** URL to the project in the provider's UI. */
  url?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** An issue (task, ticket, story, etc.). */
export interface Issue {
  /** Provider-assigned unique identifier. */
  id: string;
  /** Project this issue belongs to. */
  projectId: string;
  /** Issue title / summary. */
  title: string;
  /** Issue description body (plain text or markdown). */
  description?: string;
  /** Current status (provider-native string, e.g. "Todo", "In Progress"). */
  status: string;
  /** Unified priority. */
  priority: Priority;
  /** Labels / tags attached to this issue. */
  labels: Label[];
  /** Assignee identifier, if assigned. */
  assigneeId?: string;
  /** URL to the issue in the provider's UI. */
  url?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** A sprint or iteration. */
export interface Sprint {
  /** Provider-assigned unique identifier. */
  id: string;
  /** Sprint name. */
  name: string;
  /** ISO 8601 start date, if set. */
  startDate?: string;
  /** ISO 8601 end date, if set. */
  endDate?: string;
}

/** A comment on an issue. */
export interface Comment {
  /** Provider-assigned unique identifier. */
  id: string;
  /** The issue this comment belongs to. */
  issueId: string;
  /** Comment body (plain text or markdown). */
  body: string;
  /** Author identifier. */
  authorId?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** A label or tag. */
export interface Label {
  /** Provider-assigned unique identifier. */
  id: string;
  /** Label name. */
  name: string;
  /** Hex color code (e.g. "#34D399"), if available. */
  color?: string;
}

/** Input for creating a new project. */
export interface ProjectCreate {
  /** Project name. */
  name: string;
  /** Optional project description. */
  description?: string;
}

/** Input for creating a new issue. */
export interface IssueCreate {
  /** Project to create the issue in. */
  projectId: string;
  /** Issue title / summary. */
  title: string;
  /** Issue description body. */
  description?: string;
  /** Unified priority. Defaults to "none" if omitted. */
  priority?: Priority;
  /** Label IDs to attach. */
  labelIds?: string[];
  /** Assignee identifier. */
  assigneeId?: string;
}

/** Input for updating an existing issue. */
export interface IssueUpdate {
  /** New title. */
  title?: string;
  /** New description. */
  description?: string;
  /** New status (provider-native string). */
  status?: string;
  /** New unified priority. */
  priority?: Priority;
  /** New label IDs (replaces existing). */
  labelIds?: string[];
  /** New assignee identifier. */
  assigneeId?: string;
}

/** Options for listing resources. */
export interface ListOptions {
  /** Maximum number of items to return. */
  limit?: number;
  /** Cursor for the next page of results. */
  cursor?: string;
}

/** Paginated result set. */
export interface PaginatedResult<T> {
  /** Items in this page. */
  items: T[];
  /** Cursor for fetching the next page, if more results exist. */
  nextCursor?: string;
  /** Total count of items across all pages, if the provider supports it. */
  totalCount?: number;
}
