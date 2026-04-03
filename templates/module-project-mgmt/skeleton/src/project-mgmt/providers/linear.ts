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

// ── Linear Provider ───────────────────────────────────────────────
//
// Linear via its GraphQL API using native fetch. Each factory call
// returns a new instance with its own lazily-initialized state and
// circuit breaker.
//
// Auth: LINEAR_API_KEY environment variable.
//
// Priority mapping (Linear uses 0-4):
//   0 = No priority  -> "none"
//   1 = Urgent       -> "urgent"
//   2 = High         -> "high"
//   3 = Medium       -> "medium"
//   4 = Low          -> "low"
//

const LINEAR_API = "https://api.linear.app/graphql";

/** Map Linear priority number (0-4) to unified Priority. */
function fromLinearPriority(p: number): Priority {
  switch (p) {
    case 1: return "urgent";
    case 2: return "high";
    case 3: return "medium";
    case 4: return "low";
    default: return "none";
  }
}

/** Map unified Priority to Linear priority number (0-4). */
function toLinearPriority(p: Priority): number {
  switch (p) {
    case "urgent": return 1;
    case "high": return 2;
    case "medium": return 3;
    case "low": return 4;
    case "none": return 0;
  }
}

function createLinearProvider(): ProjectProvider {
  let apiKey: string | null = null;
  const cb = createCircuitBreaker();

  function getApiKey(): string {
    if (!apiKey) {
      const key = process.env.LINEAR_API_KEY;
      if (!key) {
        throw new Error("LINEAR_API_KEY environment variable is required");
      }
      apiKey = key;
    }
    return apiKey;
  }

  async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await cb.execute(() =>
      fetch(LINEAR_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getApiKey(),
        },
        body: JSON.stringify({ query, variables }),
      }),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Linear API error (${response.status}): ${text}`);
    }

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
    }
    if (!json.data) {
      throw new Error("Linear API returned no data");
    }
    return json.data;
  }

  return {
    name: "linear",

    async createProject(input: ProjectCreate): Promise<Project> {
      const start = performance.now();

      // Linear uses "teams" as the top-level container. Projects belong to teams.
      // We first need a team, then create the project within it.
      const teamsData = await gql<{
        teams: { nodes: Array<{ id: string }> };
      }>(`query { teams(first: 1) { nodes { id } } }`);

      const teamId = teamsData.teams.nodes[0]?.id;
      if (!teamId) {
        throw new Error("No Linear team found. Create a team first.");
      }

      const data = await gql<{
        projectCreate: {
          project: {
            id: string;
            name: string;
            description: string;
            url: string;
            createdAt: string;
            updatedAt: string;
          };
        };
      }>(
        `mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            project { id name description url createdAt updatedAt }
          }
        }`,
        {
          input: {
            name: input.name,
            description: input.description,
            teamIds: [teamId],
          },
        },
      );

      const p = data.projectCreate.project;
      logger.debug("linear createProject", { projectId: p.id, ms: performance.now() - start });

      return {
        id: p.id,
        name: p.name,
        description: p.description || undefined,
        url: p.url,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    },

    async listProjects(opts?: ListOptions): Promise<PaginatedResult<Project>> {
      const limit = opts?.limit ?? 50;
      const afterClause = opts?.cursor ? `, after: "${opts.cursor}"` : "";

      const data = await gql<{
        projects: {
          nodes: Array<{
            id: string;
            name: string;
            description: string;
            url: string;
            createdAt: string;
            updatedAt: string;
          }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }>(
        `query {
          projects(first: ${limit}${afterClause}) {
            nodes { id name description url createdAt updatedAt }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      );

      return {
        items: data.projects.nodes.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || undefined,
          url: p.url,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        nextCursor: data.projects.pageInfo.hasNextPage
          ? data.projects.pageInfo.endCursor
          : undefined,
      };
    },

    async createIssue(input: IssueCreate): Promise<Issue> {
      const start = performance.now();

      // Resolve the team from the project
      const projectData = await gql<{
        project: { teams: { nodes: Array<{ id: string }> } };
      }>(
        `query($id: String!) {
          project(id: $id) { teams { nodes { id } } }
        }`,
        { id: input.projectId },
      );

      const teamId = projectData.project.teams.nodes[0]?.id;
      if (!teamId) {
        throw new Error(`No team found for project "${input.projectId}"`);
      }

      const data = await gql<{
        issueCreate: {
          issue: {
            id: string;
            title: string;
            description: string;
            state: { name: string };
            priority: number;
            labels: { nodes: Array<{ id: string; name: string; color: string }> };
            assignee: { id: string } | null;
            url: string;
            createdAt: string;
            updatedAt: string;
          };
        };
      }>(
        `mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            issue {
              id title description
              state { name }
              priority
              labels { nodes { id name color } }
              assignee { id }
              url createdAt updatedAt
            }
          }
        }`,
        {
          input: {
            teamId,
            projectId: input.projectId,
            title: input.title,
            description: input.description,
            priority: input.priority ? toLinearPriority(input.priority) : 0,
            ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
            ...(input.labelIds?.length ? { labelIds: input.labelIds } : {}),
          },
        },
      );

      const i = data.issueCreate.issue;
      logger.debug("linear createIssue", { issueId: i.id, ms: performance.now() - start });

      return {
        id: i.id,
        projectId: input.projectId,
        title: i.title,
        description: i.description || undefined,
        status: i.state.name,
        priority: fromLinearPriority(i.priority),
        labels: i.labels.nodes.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        assigneeId: i.assignee?.id,
        url: i.url,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      };
    },

    async getIssue(id: string): Promise<Issue> {
      const data = await gql<{
        issue: {
          id: string;
          title: string;
          description: string;
          state: { name: string };
          priority: number;
          labels: { nodes: Array<{ id: string; name: string; color: string }> };
          assignee: { id: string } | null;
          project: { id: string };
          url: string;
          createdAt: string;
          updatedAt: string;
        };
      }>(
        `query($id: String!) {
          issue(id: $id) {
            id title description
            state { name }
            priority
            labels { nodes { id name color } }
            assignee { id }
            project { id }
            url createdAt updatedAt
          }
        }`,
        { id },
      );

      const i = data.issue;
      return {
        id: i.id,
        projectId: i.project.id,
        title: i.title,
        description: i.description || undefined,
        status: i.state.name,
        priority: fromLinearPriority(i.priority),
        labels: i.labels.nodes.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        assigneeId: i.assignee?.id,
        url: i.url,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      };
    },

    async updateIssue(id: string, input: IssueUpdate): Promise<Issue> {
      const start = performance.now();

      const updateInput: Record<string, unknown> = {};
      if (input.title !== undefined) updateInput.title = input.title;
      if (input.description !== undefined) updateInput.description = input.description;
      if (input.priority !== undefined) updateInput.priority = toLinearPriority(input.priority);
      if (input.assigneeId !== undefined) updateInput.assigneeId = input.assigneeId;
      if (input.labelIds !== undefined) updateInput.labelIds = input.labelIds;
      // Status change requires finding the state ID — use stateId if provided
      if (input.status !== undefined) updateInput.stateId = input.status;

      const data = await gql<{
        issueUpdate: {
          issue: {
            id: string;
            title: string;
            description: string;
            state: { name: string };
            priority: number;
            labels: { nodes: Array<{ id: string; name: string; color: string }> };
            assignee: { id: string } | null;
            project: { id: string };
            url: string;
            createdAt: string;
            updatedAt: string;
          };
        };
      }>(
        `mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            issue {
              id title description
              state { name }
              priority
              labels { nodes { id name color } }
              assignee { id }
              project { id }
              url createdAt updatedAt
            }
          }
        }`,
        { id, input: updateInput },
      );

      const i = data.issueUpdate.issue;
      logger.debug("linear updateIssue", { issueId: i.id, ms: performance.now() - start });

      return {
        id: i.id,
        projectId: i.project.id,
        title: i.title,
        description: i.description || undefined,
        status: i.state.name,
        priority: fromLinearPriority(i.priority),
        labels: i.labels.nodes.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        assigneeId: i.assignee?.id,
        url: i.url,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      };
    },

    async listIssues(projectId: string, opts?: ListOptions): Promise<PaginatedResult<Issue>> {
      const limit = opts?.limit ?? 50;
      const afterClause = opts?.cursor ? `, after: "${opts.cursor}"` : "";

      const data = await gql<{
        issues: {
          nodes: Array<{
            id: string;
            title: string;
            description: string;
            state: { name: string };
            priority: number;
            labels: { nodes: Array<{ id: string; name: string; color: string }> };
            assignee: { id: string } | null;
            project: { id: string };
            url: string;
            createdAt: string;
            updatedAt: string;
          }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }>(
        `query {
          issues(
            first: ${limit}${afterClause},
            filter: { project: { id: { eq: "${projectId}" } } }
          ) {
            nodes {
              id title description
              state { name }
              priority
              labels { nodes { id name color } }
              assignee { id }
              project { id }
              url createdAt updatedAt
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      );

      return {
        items: data.issues.nodes.map((i) => ({
          id: i.id,
          projectId: i.project.id,
          title: i.title,
          description: i.description || undefined,
          status: i.state.name,
          priority: fromLinearPriority(i.priority),
          labels: i.labels.nodes.map((l) => ({ id: l.id, name: l.name, color: l.color })),
          assigneeId: i.assignee?.id,
          url: i.url,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
        })),
        nextCursor: data.issues.pageInfo.hasNextPage
          ? data.issues.pageInfo.endCursor
          : undefined,
      };
    },

    async addComment(issueId: string, body: string): Promise<Comment> {
      const start = performance.now();

      const data = await gql<{
        commentCreate: {
          comment: {
            id: string;
            body: string;
            user: { id: string } | null;
            createdAt: string;
          };
        };
      }>(
        `mutation($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            comment { id body user { id } createdAt }
          }
        }`,
        { input: { issueId, body } },
      );

      const c = data.commentCreate.comment;
      logger.debug("linear addComment", { commentId: c.id, ms: performance.now() - start });

      return {
        id: c.id,
        issueId,
        body: c.body,
        authorId: c.user?.id,
        createdAt: c.createdAt,
      };
    },
  };
}

// Self-register factory
registerProvider("linear", createLinearProvider);
