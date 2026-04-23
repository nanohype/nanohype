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

// ── Shortcut Provider ─────────────────────────────────────────────
//
// Shortcut (formerly Clubhouse) via REST API using native fetch.
// Each factory call returns a new instance with its own
// lazily-initialized state and circuit breaker.
//
// Auth: SHORTCUT_TOKEN environment variable.
//
// Mapping conventions:
//   - Shortcut "projects" map to our Projects (deprecated in Shortcut
//     but still supported in the API — alternatively use "groups")
//   - Shortcut "stories" map to our Issues
//   - Shortcut "iterations" map to sprints
//   - Shortcut "workflow states" map to issue statuses
//
// Priority mapping (Shortcut uses named priorities):
//   p1 (urgent)  -> "urgent"
//   p2 (high)    -> "high"
//   p3 (medium)  -> "medium"
//   p4 (low)     -> "low"
//   (none)       -> "none"
//

const SHORTCUT_API = "https://api.app.shortcut.com/api/v3";

/** Map Shortcut priority to unified Priority. */
function fromShortcutPriority(value: string | undefined): Priority {
  switch (value) {
    case "p1": return "urgent";
    case "p2": return "high";
    case "p3": return "medium";
    case "p4": return "low";
    default: return "none";
  }
}

/** Map unified Priority to Shortcut priority value. */
function toShortcutPriority(p: Priority): string | undefined {
  switch (p) {
    case "urgent": return "p1";
    case "high": return "p2";
    case "medium": return "p3";
    case "low": return "p4";
    case "none": return undefined;
  }
}

function createShortcutProvider(): ProjectProvider {
  let apiToken: string | null = null;
  const cb = createCircuitBreaker();

  function getToken(): string {
    if (!apiToken) {
      const t = process.env.SHORTCUT_TOKEN;
      if (!t) {
        throw new Error("SHORTCUT_TOKEN environment variable is required");
      }
      apiToken = t;
    }
    return apiToken;
  }

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await cb.execute(() =>
      fetch(`${SHORTCUT_API}${path}`, {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          "Shortcut-Token": getToken(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shortcut API error (${response.status}): ${text}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  /** Resolve workflow state name from state ID. */
  async function resolveStateName(stateId: number): Promise<string> {
    try {
      const workflows = await api<
        Array<{
          states: Array<{ id: number; name: string }>;
        }>
      >("GET", "/workflows");

      for (const wf of workflows) {
        const state = wf.states.find((s) => s.id === stateId);
        if (state) return state.name;
      }
    } catch {
      // Fall back to raw ID if workflow lookup fails
    }
    return String(stateId);
  }

  return {
    name: "shortcut",

    async createProject(input: ProjectCreate): Promise<Project> {
      const start = performance.now();

      // Shortcut uses "groups" as the modern replacement for projects.
      // We use the projects endpoint for backwards compatibility.
      const data = await api<{
        id: number;
        name: string;
        description: string;
        app_url: string;
        created_at: string;
        updated_at: string;
      }>("POST", "/projects", {
        name: input.name,
        description: input.description ?? "",
      });

      logger.debug("shortcut createProject", {
        projectId: data.id,
        ms: performance.now() - start,
      });

      return {
        id: String(data.id),
        name: data.name,
        description: data.description || undefined,
        url: data.app_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },

    async listProjects(opts?: ListOptions): Promise<PaginatedResult<Project>> {
      // Shortcut's project list endpoint does not support pagination
      // natively. We fetch all and paginate client-side.
      const data = await api<
        Array<{
          id: number;
          name: string;
          description: string;
          app_url: string;
          created_at: string;
          updated_at: string;
        }>
      >("GET", "/projects");

      const limit = opts?.limit ?? 50;
      const cursorIndex = opts?.cursor
        ? data.findIndex((p) => String(p.id) === opts.cursor) + 1
        : 0;
      const slice = data.slice(cursorIndex, cursorIndex + limit);
      const hasMore = cursorIndex + limit < data.length;

      return {
        items: slice.map((p) => ({
          id: String(p.id),
          name: p.name,
          description: p.description || undefined,
          url: p.app_url,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })),
        nextCursor: hasMore ? String(slice[slice.length - 1]?.id) : undefined,
        totalCount: data.length,
      };
    },

    async createIssue(input: IssueCreate): Promise<Issue> {
      const start = performance.now();

      const storyData: Record<string, unknown> = {
        project_id: parseInt(input.projectId, 10),
        name: input.title,
        description: input.description ?? "",
        story_type: "feature",
      };

      const scPriority = input.priority ? toShortcutPriority(input.priority) : undefined;
      if (scPriority) {
        storyData.priority = scPriority;
      }

      if (input.assigneeId) {
        storyData.owner_ids = [input.assigneeId];
      }

      if (input.labelIds?.length) {
        storyData.labels = input.labelIds.map((id) => ({ name: id }));
      }

      const data = await api<{
        id: number;
        name: string;
        description: string;
        workflow_state_id: number;
        priority: string;
        labels: Array<{ id: number; name: string; color: string }>;
        owner_ids: string[];
        app_url: string;
        created_at: string;
        updated_at: string;
      }>("POST", "/stories", storyData);

      const stateName = await resolveStateName(data.workflow_state_id);
      logger.debug("shortcut createIssue", { storyId: data.id, ms: performance.now() - start });

      return {
        id: String(data.id),
        projectId: input.projectId,
        title: data.name,
        description: data.description || undefined,
        status: stateName,
        priority: fromShortcutPriority(data.priority),
        labels: (data.labels ?? []).map((l) => ({
          id: String(l.id),
          name: l.name,
          color: l.color ? `#${l.color}` : undefined,
        })),
        assigneeId: data.owner_ids?.[0],
        url: data.app_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },

    async getIssue(id: string): Promise<Issue> {
      const data = await api<{
        id: number;
        name: string;
        description: string;
        workflow_state_id: number;
        priority: string;
        project_id: number;
        labels: Array<{ id: number; name: string; color: string }>;
        owner_ids: string[];
        app_url: string;
        created_at: string;
        updated_at: string;
      }>("GET", `/stories/${id}`);

      const stateName = await resolveStateName(data.workflow_state_id);

      return {
        id: String(data.id),
        projectId: String(data.project_id),
        title: data.name,
        description: data.description || undefined,
        status: stateName,
        priority: fromShortcutPriority(data.priority),
        labels: (data.labels ?? []).map((l) => ({
          id: String(l.id),
          name: l.name,
          color: l.color ? `#${l.color}` : undefined,
        })),
        assigneeId: data.owner_ids?.[0],
        url: data.app_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },

    async updateIssue(id: string, input: IssueUpdate): Promise<Issue> {
      const start = performance.now();

      const storyData: Record<string, unknown> = {};
      if (input.title !== undefined) storyData.name = input.title;
      if (input.description !== undefined) storyData.description = input.description;
      if (input.assigneeId !== undefined) storyData.owner_ids = [input.assigneeId];
      if (input.priority !== undefined) {
        const scPriority = toShortcutPriority(input.priority);
        if (scPriority) storyData.priority = scPriority;
      }
      if (input.labelIds !== undefined) {
        storyData.labels = input.labelIds.map((name) => ({ name }));
      }

      // Resolve status to workflow state ID
      if (input.status !== undefined) {
        const workflows = await api<
          Array<{ states: Array<{ id: number; name: string }> }>
        >("GET", "/workflows");

        for (const wf of workflows) {
          const state = wf.states.find(
            (s) => s.name.toLowerCase() === input.status!.toLowerCase(),
          );
          if (state) {
            storyData.workflow_state_id = state.id;
            break;
          }
        }
      }

      await api("PUT", `/stories/${id}`, storyData);
      logger.debug("shortcut updateIssue", { storyId: id, ms: performance.now() - start });

      return this.getIssue(id);
    },

    async listIssues(projectId: string, opts?: ListOptions): Promise<PaginatedResult<Issue>> {
      // Shortcut uses a search endpoint for listing stories by project.
      const limit = opts?.limit ?? 25;
      const nextToken = opts?.cursor;

      const data = await api<{
        data: Array<{
          id: number;
          name: string;
          description: string;
          workflow_state_id: number;
          priority: string;
          project_id: number;
          labels: Array<{ id: number; name: string; color: string }>;
          owner_ids: string[];
          app_url: string;
          created_at: string;
          updated_at: string;
        }>;
        next: string | null;
        total: number;
      }>("GET", `/projects/${projectId}/stories?page_size=${limit}${nextToken ? `&next=${nextToken}` : ""}`);

      // Resolve state names for all issues
      const items: Issue[] = [];
      for (const s of data.data ?? []) {
        const stateName = await resolveStateName(s.workflow_state_id);
        items.push({
          id: String(s.id),
          projectId: String(s.project_id),
          title: s.name,
          description: s.description || undefined,
          status: stateName,
          priority: fromShortcutPriority(s.priority),
          labels: (s.labels ?? []).map((l) => ({
            id: String(l.id),
            name: l.name,
            color: l.color ? `#${l.color}` : undefined,
          })),
          assigneeId: s.owner_ids?.[0],
          url: s.app_url,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        });
      }

      return {
        items,
        nextCursor: data.next ?? undefined,
        totalCount: data.total,
      };
    },

    async addComment(issueId: string, body: string): Promise<Comment> {
      const start = performance.now();

      const data = await api<{
        id: number;
        text: string;
        author_id: string;
        created_at: string;
      }>("POST", `/stories/${issueId}/comments`, { text: body });

      logger.debug("shortcut addComment", { commentId: data.id, ms: performance.now() - start });

      return {
        id: String(data.id),
        issueId,
        body: data.text,
        authorId: data.author_id,
        createdAt: data.created_at,
      };
    },
  };
}

// Self-register factory
registerProvider("shortcut", createShortcutProvider);
