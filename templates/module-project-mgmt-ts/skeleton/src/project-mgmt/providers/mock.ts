import type { ProjectProvider } from "./types.js";
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
} from "../types.js";
import { registerProvider } from "./registry.js";

// ── Mock Provider ──────────────────────────────────────────────────
//
// In-memory provider for testing. Uses deterministic IDs based on a
// counter so tests can rely on stable identifiers. No external
// dependencies or API keys required. Always included in the module.
//

function createMockProvider(): ProjectProvider {
  let idCounter = 0;
  const projects = new Map<string, Project>();
  const issues = new Map<string, Issue>();
  const comments = new Map<string, Comment[]>();

  function nextId(prefix: string): string {
    idCounter++;
    return `${prefix}-${String(idCounter).padStart(4, "0")}`;
  }

  function now(): string {
    return new Date().toISOString();
  }

  return {
    name: "mock",

    async createProject(input: ProjectCreate): Promise<Project> {
      const id = nextId("proj");
      const timestamp = now();
      const project: Project = {
        id,
        name: input.name,
        description: input.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      projects.set(id, project);
      return project;
    },

    async listProjects(opts?: ListOptions): Promise<PaginatedResult<Project>> {
      const limit = opts?.limit ?? 50;
      const all = Array.from(projects.values());
      const cursorIndex = opts?.cursor
        ? all.findIndex((p) => p.id === opts.cursor) + 1
        : 0;
      const slice = all.slice(cursorIndex, cursorIndex + limit);
      const hasMore = cursorIndex + limit < all.length;

      return {
        items: slice,
        nextCursor: hasMore ? slice[slice.length - 1]?.id : undefined,
        totalCount: all.length,
      };
    },

    async createIssue(input: IssueCreate): Promise<Issue> {
      const id = nextId("issue");
      const timestamp = now();
      const issue: Issue = {
        id,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        status: "backlog",
        priority: input.priority ?? "none",
        labels: [],
        assigneeId: input.assigneeId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      issues.set(id, issue);
      return issue;
    },

    async getIssue(id: string): Promise<Issue> {
      const issue = issues.get(id);
      if (!issue) {
        throw new Error(`Issue "${id}" not found`);
      }
      return issue;
    },

    async updateIssue(id: string, input: IssueUpdate): Promise<Issue> {
      const issue = issues.get(id);
      if (!issue) {
        throw new Error(`Issue "${id}" not found`);
      }

      const updated: Issue = {
        ...issue,
        title: input.title ?? issue.title,
        description: input.description !== undefined ? input.description : issue.description,
        status: input.status ?? issue.status,
        priority: input.priority ?? issue.priority,
        assigneeId: input.assigneeId !== undefined ? input.assigneeId : issue.assigneeId,
        updatedAt: now(),
      };

      issues.set(id, updated);
      return updated;
    },

    async listIssues(projectId: string, opts?: ListOptions): Promise<PaginatedResult<Issue>> {
      const limit = opts?.limit ?? 50;
      const all = Array.from(issues.values()).filter((i) => i.projectId === projectId);
      const cursorIndex = opts?.cursor
        ? all.findIndex((i) => i.id === opts.cursor) + 1
        : 0;
      const slice = all.slice(cursorIndex, cursorIndex + limit);
      const hasMore = cursorIndex + limit < all.length;

      return {
        items: slice,
        nextCursor: hasMore ? slice[slice.length - 1]?.id : undefined,
        totalCount: all.length,
      };
    },

    async addComment(issueId: string, body: string): Promise<Comment> {
      const issue = issues.get(issueId);
      if (!issue) {
        throw new Error(`Issue "${issueId}" not found`);
      }

      const id = nextId("comment");
      const comment: Comment = {
        id,
        issueId,
        body,
        createdAt: now(),
      };

      const existing = comments.get(issueId) ?? [];
      existing.push(comment);
      comments.set(issueId, existing);
      return comment;
    },
  };
}

// Self-register factory
registerProvider("mock", createMockProvider);
