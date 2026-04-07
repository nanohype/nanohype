import type { ProjectProvider } from "./types.js";
import type {
  Project,
  Issue,
  Comment,
  Priority,
  ProjectCreate,
  IssueCreate,
  IssueUpdate,
  ListOptions,
  PaginatedResult,
} from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { logger } from "../logger.js";

// ── Asana Provider ────────────────────────────────────────────────
//
// Asana via REST API using native fetch. Each factory call returns a
// new instance with its own lazily-initialized state and circuit
// breaker.
//
// Auth: ASANA_TOKEN environment variable (bearer token / PAT).
//
// Mapping conventions:
//   - Asana "projects" map to our Projects
//   - Asana "tasks" map to our Issues
//   - Asana "sections" map to sprints (conceptually)
//   - Asana custom fields with name "Priority" map to unified Priority
//
// Priority mapping (Asana custom field enum values):
//   "P0" -> "urgent"
//   "P1" -> "high"
//   "P2" -> "medium"
//   "P3" -> "low"
//   (none) -> "none"
//

const ASANA_API = "https://app.asana.com/api/1.0";

/** Map Asana priority custom field value to unified Priority. */
function fromAsanaPriority(value: string | undefined): Priority {
  switch (value) {
    case "P0": return "urgent";
    case "P1": return "high";
    case "P2": return "medium";
    case "P3": return "low";
    default: return "none";
  }
}

/** Map unified Priority to Asana priority custom field display value. */
function toAsanaPriorityValue(p: Priority): string | undefined {
  switch (p) {
    case "urgent": return "P0";
    case "high": return "P1";
    case "medium": return "P2";
    case "low": return "P3";
    case "none": return undefined;
  }
}

function createAsanaProvider(): ProjectProvider {
  let token: string | null = null;
  let workspaceGid: string | null = null;
  const cb = createCircuitBreaker();

  function getToken(): string {
    if (!token) {
      const t = process.env.ASANA_TOKEN;
      if (!t) {
        throw new Error("ASANA_TOKEN environment variable is required");
      }
      token = t;
    }
    return token;
  }

  async function resolveWorkspace(): Promise<string> {
    if (workspaceGid) return workspaceGid;
    const data = await api<{ data: Array<{ gid: string }> }>("GET", "/workspaces?limit=1");
    const ws = data.data[0];
    if (!ws) throw new Error("No Asana workspace found");
    workspaceGid = ws.gid;
    return workspaceGid;
  }

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await cb.execute(() =>
      fetch(`${ASANA_API}${path}`, {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        ...(body ? { body: JSON.stringify({ data: body }) } : {}),
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Asana API error (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /** Extract priority from Asana task custom fields. */
  function extractPriority(
    customFields: Array<{ name: string; enum_value?: { name: string } | null }> | undefined,
  ): Priority {
    if (!customFields) return "none";
    const priorityField = customFields.find(
      (f) => f.name.toLowerCase() === "priority",
    );
    return fromAsanaPriority(priorityField?.enum_value?.name);
  }

  return {
    name: "asana",

    async createProject(input: ProjectCreate): Promise<Project> {
      const start = performance.now();
      const wsGid = await resolveWorkspace();

      const data = await api<{
        data: {
          gid: string;
          name: string;
          notes: string;
          permalink_url: string;
          created_at: string;
          modified_at: string;
        };
      }>("POST", "/projects", {
        workspace: wsGid,
        name: input.name,
        notes: input.description ?? "",
      });

      const p = data.data;
      logger.debug("asana createProject", { projectGid: p.gid, ms: performance.now() - start });

      return {
        id: p.gid,
        name: p.name,
        description: p.notes || undefined,
        url: p.permalink_url,
        createdAt: p.created_at,
        updatedAt: p.modified_at,
      };
    },

    async listProjects(opts?: ListOptions): Promise<PaginatedResult<Project>> {
      const limit = opts?.limit ?? 50;
      const wsGid = await resolveWorkspace();
      const offsetParam = opts?.cursor ? `&offset=${opts.cursor}` : "";

      const data = await api<{
        data: Array<{
          gid: string;
          name: string;
          notes: string;
          permalink_url: string;
          created_at: string;
          modified_at: string;
        }>;
        next_page: { offset: string } | null;
      }>(
        "GET",
        `/projects?workspace=${wsGid}&limit=${limit}&opt_fields=name,notes,permalink_url,created_at,modified_at${offsetParam}`,
      );

      return {
        items: data.data.map((p) => ({
          id: p.gid,
          name: p.name,
          description: p.notes || undefined,
          url: p.permalink_url,
          createdAt: p.created_at,
          updatedAt: p.modified_at,
        })),
        nextCursor: data.next_page?.offset,
      };
    },

    async createIssue(input: IssueCreate): Promise<Issue> {
      const start = performance.now();

      const taskData: Record<string, unknown> = {
        projects: [input.projectId],
        name: input.title,
        notes: input.description ?? "",
      };

      if (input.assigneeId) {
        taskData.assignee = input.assigneeId;
      }

      const data = await api<{
        data: {
          gid: string;
          name: string;
          notes: string;
          assignee_status: string;
          assignee: { gid: string } | null;
          custom_fields: Array<{ name: string; enum_value?: { name: string } | null }>;
          tags: Array<{ gid: string; name: string }>;
          permalink_url: string;
          created_at: string;
          modified_at: string;
        };
      }>("POST", "/tasks", taskData);

      const t = data.data;
      logger.debug("asana createIssue", { taskGid: t.gid, ms: performance.now() - start });

      return {
        id: t.gid,
        projectId: input.projectId,
        title: t.name,
        description: t.notes || undefined,
        status: t.assignee_status || "inbox",
        priority: input.priority ?? extractPriority(t.custom_fields),
        labels: (t.tags ?? []).map((tag) => ({ id: tag.gid, name: tag.name })),
        assigneeId: t.assignee?.gid,
        url: t.permalink_url,
        createdAt: t.created_at,
        updatedAt: t.modified_at,
      };
    },

    async getIssue(id: string): Promise<Issue> {
      const data = await api<{
        data: {
          gid: string;
          name: string;
          notes: string;
          assignee_status: string;
          assignee: { gid: string } | null;
          memberships: Array<{ project: { gid: string } }>;
          custom_fields: Array<{ name: string; enum_value?: { name: string } | null }>;
          tags: Array<{ gid: string; name: string }>;
          permalink_url: string;
          created_at: string;
          modified_at: string;
        };
      }>(
        "GET",
        `/tasks/${id}?opt_fields=name,notes,assignee_status,assignee,memberships.project,custom_fields,tags,permalink_url,created_at,modified_at`,
      );

      const t = data.data;
      const projectId = t.memberships?.[0]?.project?.gid ?? "";

      return {
        id: t.gid,
        projectId,
        title: t.name,
        description: t.notes || undefined,
        status: t.assignee_status || "inbox",
        priority: extractPriority(t.custom_fields),
        labels: (t.tags ?? []).map((tag) => ({ id: tag.gid, name: tag.name })),
        assigneeId: t.assignee?.gid,
        url: t.permalink_url,
        createdAt: t.created_at,
        updatedAt: t.modified_at,
      };
    },

    async updateIssue(id: string, input: IssueUpdate): Promise<Issue> {
      const start = performance.now();

      const taskData: Record<string, unknown> = {};
      if (input.title !== undefined) taskData.name = input.title;
      if (input.description !== undefined) taskData.notes = input.description;
      if (input.assigneeId !== undefined) taskData.assignee = input.assigneeId;

      await api("PUT", `/tasks/${id}`, taskData);
      logger.debug("asana updateIssue", { taskGid: id, ms: performance.now() - start });

      return this.getIssue(id);
    },

    async listIssues(projectId: string, opts?: ListOptions): Promise<PaginatedResult<Issue>> {
      const limit = opts?.limit ?? 50;
      const offsetParam = opts?.cursor ? `&offset=${opts.cursor}` : "";

      const data = await api<{
        data: Array<{
          gid: string;
          name: string;
          notes: string;
          assignee_status: string;
          assignee: { gid: string } | null;
          custom_fields: Array<{ name: string; enum_value?: { name: string } | null }>;
          tags: Array<{ gid: string; name: string }>;
          permalink_url: string;
          created_at: string;
          modified_at: string;
        }>;
        next_page: { offset: string } | null;
      }>(
        "GET",
        `/projects/${projectId}/tasks?limit=${limit}&opt_fields=name,notes,assignee_status,assignee,custom_fields,tags,permalink_url,created_at,modified_at${offsetParam}`,
      );

      return {
        items: data.data.map((t) => ({
          id: t.gid,
          projectId,
          title: t.name,
          description: t.notes || undefined,
          status: t.assignee_status || "inbox",
          priority: extractPriority(t.custom_fields),
          labels: (t.tags ?? []).map((tag) => ({ id: tag.gid, name: tag.name })),
          assigneeId: t.assignee?.gid,
          url: t.permalink_url,
          createdAt: t.created_at,
          updatedAt: t.modified_at,
        })),
        nextCursor: data.next_page?.offset,
      };
    },

    async addComment(issueId: string, body: string): Promise<Comment> {
      const start = performance.now();

      const data = await api<{
        data: {
          gid: string;
          text: string;
          author: { gid: string };
          created_at: string;
        };
      }>("POST", `/tasks/${issueId}/stories`, {
        text: body,
      });

      const s = data.data;
      logger.debug("asana addComment", { storyGid: s.gid, ms: performance.now() - start });

      return {
        id: s.gid,
        issueId,
        body: s.text,
        authorId: s.author?.gid,
        createdAt: s.created_at,
      };
    },
  };
}

// Self-register factory
registerProvider("asana", createAsanaProvider);
