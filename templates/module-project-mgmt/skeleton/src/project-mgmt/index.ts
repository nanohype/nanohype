// ── Module Project Management — Main Exports ───────────────────────
//
// Public API for the project management module. Imports all providers
// to trigger self-registration, then exposes createProjectClient as
// the primary entry point.
//

import { validateBootstrap } from "./bootstrap.js";
import { ProjectConfigSchema } from "./config.js";
import { getProvider, listProviders } from "./providers/index.js";
import {
  projectMgmtRequestTotal,
  projectMgmtDurationMs,
} from "./metrics.js";
import type { ProjectProvider } from "./providers/types.js";
import type {
  Project,
  Issue,
  Comment,
  ProjectCreate,
  IssueCreate,
  IssueUpdate,
  ListOptions,
  PaginatedResult,
  Priority,
  Sprint,
  Label,
} from "./types.js";
import type { ProjectConfig } from "./config.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { ProjectProvider, ProjectProviderFactory } from "./providers/types.js";
export type {
  Project,
  Issue,
  Comment,
  Sprint,
  Label,
  Priority,
  ProjectCreate,
  IssueCreate,
  IssueUpdate,
  ListOptions,
  PaginatedResult,
} from "./types.js";
export { createCircuitBreaker, CircuitBreakerOpenError } from "./resilience/circuit-breaker.js";
export type { CircuitBreakerOptions } from "./resilience/circuit-breaker.js";
export { ProjectConfigSchema } from "./config.js";
export type { ProjectConfig } from "./config.js";

// ── Project Client Facade ─────────────────────────────────────────

export interface ProjectClient {
  /** Get a provider instance by name. Falls back to default provider. */
  get(name?: string): ProjectProvider;

  /** Create a project using the default or specified provider. */
  createProject(input: ProjectCreate, provider?: string): Promise<Project>;

  /** List projects using the default or specified provider. */
  listProjects(opts?: ListOptions, provider?: string): Promise<PaginatedResult<Project>>;

  /** Create an issue using the default or specified provider. */
  createIssue(input: IssueCreate, provider?: string): Promise<Issue>;

  /** Get an issue by ID using the default or specified provider. */
  getIssue(id: string, provider?: string): Promise<Issue>;

  /** Update an issue using the default or specified provider. */
  updateIssue(id: string, input: IssueUpdate, provider?: string): Promise<Issue>;

  /** List issues in a project using the default or specified provider. */
  listIssues(projectId: string, opts?: ListOptions, provider?: string): Promise<PaginatedResult<Issue>>;

  /** Add a comment to an issue using the default or specified provider. */
  addComment(issueId: string, body: string, provider?: string): Promise<Comment>;

  /** List all registered provider names. */
  list(): string[];

  /** The resolved configuration. */
  readonly config: ProjectConfig;
}

/**
 * Create a configured project management client.
 *
 * The client wraps the low-level provider factories with a
 * high-level API that applies default configuration, records
 * OTel metrics, and provides a convenient interface.
 *
 * ```typescript
 * const client = createProjectClient({ defaultProvider: "linear" });
 * const project = await client.createProject({ name: "My Project" });
 * const issue = await client.createIssue({
 *   projectId: project.id,
 *   title: "First task",
 *   priority: "high",
 * });
 * ```
 */
export function createProjectClient(
  rawConfig: Partial<ProjectConfig> = {},
): ProjectClient {
  const parsed = ProjectConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Invalid project config: ${issues}`);
  }

  validateBootstrap();

  const config = parsed.data;

  function get(name?: string): ProjectProvider {
    return getProvider(name ?? config.defaultProvider);
  }

  async function withMetrics<T>(
    operation: string,
    providerName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      projectMgmtRequestTotal.add(1, { provider: providerName, operation, status: "success" });
      return result;
    } catch (error) {
      projectMgmtRequestTotal.add(1, { provider: providerName, operation, status: "error" });
      throw error;
    } finally {
      projectMgmtDurationMs.record(performance.now() - start, {
        provider: providerName,
        operation,
      });
    }
  }

  async function createProject(input: ProjectCreate, provider?: string): Promise<Project> {
    const name = provider ?? config.defaultProvider;
    const p = getProvider(name);
    return withMetrics("createProject", name, () => p.createProject(input));
  }

  async function listProjectsFn(
    opts?: ListOptions,
    provider?: string,
  ): Promise<PaginatedResult<Project>> {
    const name = provider ?? config.defaultProvider;
    const p = getProvider(name);
    return withMetrics("listProjects", name, () => p.listProjects(opts));
  }

  async function createIssue(input: IssueCreate, provider?: string): Promise<Issue> {
    const name = provider ?? config.defaultProvider;
    const p = getProvider(name);
    return withMetrics("createIssue", name, () => p.createIssue(input));
  }

  async function getIssueFn(id: string, provider?: string): Promise<Issue> {
    const name = provider ?? config.defaultProvider;
    const p = getProvider(name);
    return withMetrics("getIssue", name, () => p.getIssue(id));
  }

  async function updateIssue(
    id: string,
    input: IssueUpdate,
    provider?: string,
  ): Promise<Issue> {
    const name = provider ?? config.defaultProvider;
    const p = getProvider(name);
    return withMetrics("updateIssue", name, () => p.updateIssue(id, input));
  }

  async function listIssuesFn(
    projectId: string,
    opts?: ListOptions,
    provider?: string,
  ): Promise<PaginatedResult<Issue>> {
    const name = provider ?? config.defaultProvider;
    const p = getProvider(name);
    return withMetrics("listIssues", name, () => p.listIssues(projectId, opts));
  }

  async function addComment(
    issueId: string,
    body: string,
    provider?: string,
  ): Promise<Comment> {
    const name = provider ?? config.defaultProvider;
    const p = getProvider(name);
    return withMetrics("addComment", name, () => p.addComment(issueId, body));
  }

  return {
    get,
    createProject,
    listProjects: listProjectsFn,
    createIssue,
    getIssue: getIssueFn,
    updateIssue,
    listIssues: listIssuesFn,
    addComment,
    list: listProviders,
    config,
  };
}
