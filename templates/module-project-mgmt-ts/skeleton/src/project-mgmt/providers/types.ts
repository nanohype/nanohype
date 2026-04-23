// ── Project Provider Interface (Canonical) ─────────────────────────
//
// Every project management provider implements this interface. The
// registry stores provider factories — each call to getProvider()
// returns a fresh instance with its own circuit breaker and API
// client state.
//
// No module-level mutable state: API clients are lazily initialized
// inside each factory closure, and circuit breakers are per-instance.
//

import type {
  Project,
  Issue,
  Comment,
  ProjectCreate,
  IssueCreate,
  IssueUpdate,
  ListOptions,
  PaginatedResult,
} from "../types.js";

/** Provider factory — returns a new ProjectProvider instance each time. */
export type ProjectProviderFactory = () => ProjectProvider;

export interface ProjectProvider {
  /** Unique provider name (e.g. "linear", "jira", "asana"). */
  readonly name: string;

  /** Create a new project. */
  createProject(input: ProjectCreate): Promise<Project>;

  /** List projects with cursor pagination. */
  listProjects(opts?: ListOptions): Promise<PaginatedResult<Project>>;

  /** Create a new issue in a project. */
  createIssue(input: IssueCreate): Promise<Issue>;

  /** Get a single issue by ID. */
  getIssue(id: string): Promise<Issue>;

  /** Update an existing issue. */
  updateIssue(id: string, input: IssueUpdate): Promise<Issue>;

  /** List issues in a project with cursor pagination. */
  listIssues(projectId: string, opts?: ListOptions): Promise<PaginatedResult<Issue>>;

  /** Add a comment to an issue. */
  addComment(issueId: string, body: string): Promise<Comment>;
}
