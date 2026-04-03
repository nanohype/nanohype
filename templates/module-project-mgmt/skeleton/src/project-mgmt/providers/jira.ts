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

// ── Jira Provider ─────────────────────────────────────────────────
//
// Jira Cloud via REST v3 API using native fetch. Each factory call
// returns a new instance with its own lazily-initialized state and
// circuit breaker.
//
// Auth: JIRA_EMAIL + JIRA_TOKEN (basic auth) + JIRA_BASE_URL.
//
// Priority mapping (Jira uses named priorities):
//   "Highest"  -> "urgent"
//   "High"     -> "high"
//   "Medium"   -> "medium"
//   "Low"      -> "low"
//   "Lowest"   -> "none"
//
// Descriptions use Atlassian Document Format (ADF). We convert
// plain text to a simple ADF paragraph for writes and extract
// plain text from ADF for reads.
//

/** Map Jira priority name to unified Priority. */
function fromJiraPriority(name: string | undefined): Priority {
  switch (name?.toLowerCase()) {
    case "highest": return "urgent";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    case "lowest": return "none";
    default: return "none";
  }
}

/** Map unified Priority to Jira priority name. */
function toJiraPriorityName(p: Priority): string {
  switch (p) {
    case "urgent": return "Highest";
    case "high": return "High";
    case "medium": return "Medium";
    case "low": return "Low";
    case "none": return "Lowest";
  }
}

/** Convert plain text to ADF paragraph. */
function textToAdf(text: string): object {
  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

/** Extract plain text from ADF document. */
function adfToText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";
  const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
  if (!doc.content) return "";
  return doc.content
    .flatMap((block) => block.content?.map((inline) => inline.text ?? "") ?? [])
    .join("");
}

interface JiraConfig {
  email: string;
  token: string;
  baseUrl: string;
}

function createJiraProvider(): ProjectProvider {
  let config: JiraConfig | null = null;
  const cb = createCircuitBreaker();

  function getConfig(): JiraConfig {
    if (!config) {
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_TOKEN;
      const baseUrl = process.env.JIRA_BASE_URL;
      if (!email || !token || !baseUrl) {
        throw new Error(
          "JIRA_EMAIL, JIRA_TOKEN, and JIRA_BASE_URL environment variables are required",
        );
      }
      config = { email, token, baseUrl: baseUrl.replace(/\/$/, "") };
    }
    return config;
  }

  async function api<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const { email, token, baseUrl } = getConfig();
    const auth = Buffer.from(`${email}:${token}`).toString("base64");

    const response = await cb.execute(() =>
      fetch(`${baseUrl}/rest/api/3${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Jira API error (${response.status}): ${text}`);
    }

    // 204 No Content
    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
  }

  /** Map Jira project to unified Project. */
  function mapProject(p: {
    id: string;
    key: string;
    name: string;
    description?: string;
    self: string;
  }): Project {
    const { baseUrl } = getConfig();
    return {
      id: p.key,
      name: p.name,
      description: typeof p.description === "string" ? p.description : undefined,
      url: `${baseUrl}/browse/${p.key}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Map Jira issue to unified Issue. */
  function mapIssue(i: {
    key: string;
    fields: {
      project: { key: string };
      summary: string;
      description?: unknown;
      status: { name: string };
      priority?: { name: string };
      labels?: string[];
      assignee?: { accountId: string } | null;
      created: string;
      updated: string;
    };
  }): Issue {
    const { baseUrl } = getConfig();
    return {
      id: i.key,
      projectId: i.fields.project.key,
      title: i.fields.summary,
      description: adfToText(i.fields.description),
      status: i.fields.status.name,
      priority: fromJiraPriority(i.fields.priority?.name),
      labels: (i.fields.labels ?? []).map((l: string) => ({ id: l, name: l })),
      assigneeId: i.fields.assignee?.accountId,
      url: `${baseUrl}/browse/${i.key}`,
      createdAt: i.fields.created,
      updatedAt: i.fields.updated,
    };
  }

  return {
    name: "jira",

    async createProject(input: ProjectCreate): Promise<Project> {
      const start = performance.now();

      // Jira requires a unique project key. Derive from name (first 10 uppercase chars).
      const key = input.name
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 10);

      const data = await api<{
        id: string;
        key: string;
        self: string;
      }>("POST", "/project", {
        key,
        name: input.name,
        description: input.description,
        projectTypeKey: "software",
        leadAccountId: "unassigned",
      });

      logger.debug("jira createProject", { projectKey: data.key, ms: performance.now() - start });

      return mapProject({
        id: data.id,
        key: data.key,
        name: input.name,
        description: input.description,
        self: data.self,
      });
    },

    async listProjects(opts?: ListOptions): Promise<PaginatedResult<Project>> {
      const limit = opts?.limit ?? 50;
      const startAt = opts?.cursor ? parseInt(opts.cursor, 10) : 0;

      const data = await api<{
        values: Array<{
          id: string;
          key: string;
          name: string;
          description?: string;
          self: string;
        }>;
        total: number;
      }>("GET", `/project/search?maxResults=${limit}&startAt=${startAt}`);

      const nextStart = startAt + data.values.length;

      return {
        items: data.values.map(mapProject),
        nextCursor: nextStart < data.total ? String(nextStart) : undefined,
        totalCount: data.total,
      };
    },

    async createIssue(input: IssueCreate): Promise<Issue> {
      const start = performance.now();

      const fields: Record<string, unknown> = {
        project: { key: input.projectId },
        summary: input.title,
        issuetype: { name: "Task" },
      };

      if (input.description) {
        fields.description = textToAdf(input.description);
      }
      if (input.priority) {
        fields.priority = { name: toJiraPriorityName(input.priority) };
      }
      if (input.assigneeId) {
        fields.assignee = { accountId: input.assigneeId };
      }
      if (input.labelIds?.length) {
        fields.labels = input.labelIds;
      }

      const data = await api<{ key: string }>("POST", "/issue", { fields });

      logger.debug("jira createIssue", { issueKey: data.key, ms: performance.now() - start });

      // Fetch the full issue to return complete data
      return this.getIssue(data.key);
    },

    async getIssue(id: string): Promise<Issue> {
      const data = await api<{
        key: string;
        fields: {
          project: { key: string };
          summary: string;
          description?: unknown;
          status: { name: string };
          priority?: { name: string };
          labels?: string[];
          assignee?: { accountId: string } | null;
          created: string;
          updated: string;
        };
      }>("GET", `/issue/${id}`);

      return mapIssue(data);
    },

    async updateIssue(id: string, input: IssueUpdate): Promise<Issue> {
      const start = performance.now();

      const fields: Record<string, unknown> = {};
      if (input.title !== undefined) fields.summary = input.title;
      if (input.description !== undefined) fields.description = textToAdf(input.description);
      if (input.priority !== undefined) fields.priority = { name: toJiraPriorityName(input.priority) };
      if (input.assigneeId !== undefined) fields.assignee = { accountId: input.assigneeId };
      if (input.labelIds !== undefined) fields.labels = input.labelIds;

      await api("PUT", `/issue/${id}`, { fields });

      // Handle status transition separately via Jira transitions API
      if (input.status !== undefined) {
        const transitions = await api<{
          transitions: Array<{ id: string; name: string }>;
        }>("GET", `/issue/${id}/transitions`);

        const target = transitions.transitions.find(
          (t) => t.name.toLowerCase() === input.status!.toLowerCase(),
        );
        if (target) {
          await api("POST", `/issue/${id}/transitions`, {
            transition: { id: target.id },
          });
        }
      }

      logger.debug("jira updateIssue", { issueKey: id, ms: performance.now() - start });

      return this.getIssue(id);
    },

    async listIssues(projectId: string, opts?: ListOptions): Promise<PaginatedResult<Issue>> {
      const limit = opts?.limit ?? 50;
      const startAt = opts?.cursor ? parseInt(opts.cursor, 10) : 0;

      const data = await api<{
        issues: Array<{
          key: string;
          fields: {
            project: { key: string };
            summary: string;
            description?: unknown;
            status: { name: string };
            priority?: { name: string };
            labels?: string[];
            assignee?: { accountId: string } | null;
            created: string;
            updated: string;
          };
        }>;
        total: number;
      }>(
        "GET",
        `/search?jql=${encodeURIComponent(`project = "${projectId}"`)}&maxResults=${limit}&startAt=${startAt}`,
      );

      const nextStart = startAt + data.issues.length;

      return {
        items: data.issues.map(mapIssue),
        nextCursor: nextStart < data.total ? String(nextStart) : undefined,
        totalCount: data.total,
      };
    },

    async addComment(issueId: string, body: string): Promise<Comment> {
      const start = performance.now();

      const data = await api<{
        id: string;
        body: unknown;
        author: { accountId: string };
        created: string;
      }>("POST", `/issue/${issueId}/comment`, {
        body: textToAdf(body),
      });

      logger.debug("jira addComment", { commentId: data.id, ms: performance.now() - start });

      return {
        id: data.id,
        issueId,
        body,
        authorId: data.author.accountId,
        createdAt: data.created,
      };
    },
  };
}

// Self-register factory
registerProvider("jira", createJiraProvider);
