# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createProjectClient } from "./project-mgmt/index.js";

const client = createProjectClient({ defaultProvider: "__PROVIDER__" });

// Create a project
const project = await client.createProject({
  name: "My Project",
  description: "A new project",
});

// Create an issue
const issue = await client.createIssue({
  projectId: project.id,
  title: "First task",
  description: "Implement the feature",
  priority: "high",
});

// List issues with pagination
const page = await client.listIssues(project.id, { limit: 25 });
console.log(`Found ${page.totalCount} issues`);

for (const item of page.items) {
  console.log(`[${item.priority}] ${item.title} — ${item.status}`);
}

// Update an issue
await client.updateIssue(issue.id, { status: "in_progress" });

// Add a comment
await client.addComment(issue.id, "Work has started on this task.");
```

## Providers

| Provider | API | Auth | Default |
|----------|-----|------|---------|
| `linear` | GraphQL (native fetch) | `LINEAR_API_KEY` | Yes |
| `jira` | REST v3 (native fetch) | `JIRA_EMAIL` + `JIRA_TOKEN` + `JIRA_BASE_URL` | No |
| `asana` | REST (native fetch) | `ASANA_TOKEN` | No |
| `shortcut` | REST (native fetch) | `SHORTCUT_TOKEN` | No |
| `mock` | In-memory | none | No |

## Priority Mapping

Each provider maps its native priority system to a unified enum:

| Unified | Linear (0-4) | Jira | Asana | Shortcut |
|---------|-------------|------|-------|----------|
| `urgent` | 1 (Urgent) | Highest | P0 | Urgent (p1) |
| `high` | 2 (High) | High | P1 | High (p2) |
| `medium` | 3 (Medium) | Medium | P2 | Medium (p3) |
| `low` | 4 (Low) | Low | P3 | Low (p4) |
| `none` | 0 (No priority) | Lowest | none | none |

## Custom Providers

Register a new provider factory:

```typescript
import { registerProvider } from "./project-mgmt/providers/index.js";
import type { ProjectProvider } from "./project-mgmt/providers/types.js";

function createMyProvider(): ProjectProvider {
  return {
    name: "my-provider",
    async createProject(input) { /* ... */ },
    async listProjects(opts) { /* ... */ },
    async createIssue(input) { /* ... */ },
    async getIssue(id) { /* ... */ },
    async updateIssue(id, input) { /* ... */ },
    async listIssues(projectId, opts) { /* ... */ },
    async addComment(issueId, body) { /* ... */ },
  };
}

registerProvider("my-provider", createMyProvider);
```

## Architecture

- **Factory-based registry** -- `registerProvider(name, factory)` stores a factory function, and `getProvider(name)` calls it to produce a fresh instance. No module-level mutable state is shared between callers -- each instance has its own API client state, circuit breaker, and internal state.
- **Lazy client initialization** -- API clients are created on first use inside each factory closure, not at import time. This avoids side effects from module loading.
- **Per-instance circuit breakers** -- each provider instance gets its own circuit breaker via the factory. Failures in one consumer's provider do not affect other consumers.
- **Native fetch everywhere** -- all providers use the built-in `fetch` API. Linear uses GraphQL (single endpoint), Jira/Asana/Shortcut use REST. No SDK dependencies.
- **Unified priority mapping** -- each provider maps its native priority system to the common `Priority` type.
- **Cursor pagination** -- `PaginatedResult<T>` with `nextCursor` for efficient traversal of large result sets.
- **OTel metrics** -- request totals and duration are recorded as OTel counters and histograms. No-ops when no SDK is configured.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message.
- **Zod config validation** -- `createProjectClient()` validates configuration at construction time, catching errors early.

## Production Readiness

- [ ] Set API keys for all providers you use (see `.env.example`)
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Wire in OpenTelemetry SDK for metrics collection
- [ ] Monitor `project_mgmt_request_total` and `project_mgmt_duration_ms` dashboards
- [ ] Set circuit breaker thresholds appropriate for your traffic volume
- [ ] Test failover behavior when a provider is unavailable

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

Apache-2.0
