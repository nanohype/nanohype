## Overview

Add an `llm-wiki` template to the AI Systems category. Scaffolds a multi-tenant, LLM-maintained knowledge base where agents incrementally build structured markdown wikis from raw sources — knowledge compounds over time rather than being re-derived per query.

Inspired by [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): instead of traditional RAG (embed everything, retrieve on demand, throw away the synthesis), an LLM reads sources, extracts structure, updates wiki pages, and maintains cross-references and consistency. The wiki becomes a persistent, compounding artifact.

This template extends the pattern with multi-tenancy — tenant-isolated wiki spaces with independent schemas, source provenance tracking, and access control. Designed for consultancies and teams managing knowledge across multiple clients or domains.

## Why this isn't RAG

RAG re-derives understanding on every query. The wiki pattern front-loads the work: the LLM reads a source once, updates every relevant page, flags contradictions, and builds cross-references. Queries hit a pre-structured knowledge graph instead of raw chunks. Tradeoffs:

- **Better for:** domains where knowledge compounds (client engagements, research, compliance), where contradictions matter, where humans need to audit what the system "knows"
- **Worse for:** rapidly changing corpora where staleness is expensive, pure Q&A over static document sets
- **Complementary to:** RAG (wiki pages can be retrieval targets), agentic-loop (agents can ingest/query/lint as tool calls)

## Architecture

Three-layer design per tenant, plus a shared control plane:

```
┌─────────────────────────────────────────────────┐
│                  Control Plane                   │
│  tenant registry · schema registry · auth/authz  │
│  operation queue · job scheduling · audit log    │
└─────────────────┬───────────────────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Tenant A │ │Tenant B │ │Tenant C │
├─────────┤ ├─────────┤ ├─────────┤
│ sources/│ │ sources/│ │ sources/│
│ wiki/   │ │ wiki/   │ │ wiki/   │
│ schema  │ │ schema  │ │ schema  │
└─────────┘ └─────────┘ └─────────┘
```

### Layer 1: Raw Sources (per tenant)

Immutable, append-only source store. Each source gets a provenance record (origin URL, ingestion timestamp, content hash, ingesting agent ID). Pluggable source providers via registry pattern:

- `local` — filesystem watcher (markdown, PDF, plaintext)
- `web` — URL fetch + readability extraction
- `github` — repo files, issues, PRs via GitHub API
- `notion` — pages via Notion API
- `slack` — channel history via Slack API
- `mock` — in-memory for testing

### Layer 2: The Wiki (per tenant)

LLM-generated markdown pages organized by schema-defined structure. Each page tracks:

- Which sources informed it (bidirectional source ↔ page links)
- Last updated timestamp and updating agent
- Confidence level (sourced vs. inferred vs. stale)
- Cross-references to other pages (explicit `[[wiki-links]]`)

Storage is git-backed markdown by default (every edit is a commit — full audit trail, diffable, branchable). Pluggable via storage provider:

- `git` — local git repo per tenant (default)
- `github` — remote GitHub repo
- `sqlite` — FTS5-indexed for fast search without git overhead
- `mock` — in-memory

### Layer 3: The Schema (per tenant)

A `wiki-schema.yaml` per tenant that governs wiki structure, page types, and LLM behavior:

```yaml
name: "acme-knowledge-base"
description: "Internal knowledge base for Acme Corp engagement"

page_types:
  - name: entity
    description: "A person, company, product, or system"
    required_sections: [summary, relationships, sources]
  - name: concept
    description: "A technical concept, pattern, or methodology"
    required_sections: [definition, examples, related_concepts, sources]
  - name: decision
    description: "An architectural or business decision"
    required_sections: [context, decision, consequences, sources]
  - name: timeline
    description: "Chronological record of events"
    required_sections: [events, sources]

structure:
  index: "index.md"           # auto-maintained table of contents
  orphan_threshold_days: 14   # flag pages with no inbound links after N days
  contradiction_policy: flag  # flag | resolve | ignore

llm:
  provider: anthropic         # LLM provider for wiki operations
  model: claude-sonnet-4-6  # model for ingest/query/lint
  temperature: 0.2            # low temp for factual extraction
  max_pages_per_ingest: 10    # bound on pages created/updated per source
```

### Core Operations

Three operations, matching the original pattern:

**Ingest** — Process a new source, extract structured knowledge, create/update wiki pages:
1. Hash source content, skip if already ingested (idempotent)
2. LLM reads source against current wiki state
3. Creates new pages or updates existing ones (type-checked against schema)
4. Maintains bidirectional source ↔ page links
5. Flags contradictions with existing pages
6. Updates index
7. Commits changes (git storage) or writes transaction (sqlite)

**Query** — Search the wiki, synthesize an answer, optionally file discoveries back:
1. Search wiki pages (FTS or git-grep depending on storage)
2. LLM synthesizes answer from relevant pages
3. Returns answer with source citations (page → original source chain)
4. Optionally creates a new "discovery" page if the synthesis reveals new structure

**Lint** — Health check for wiki consistency:
1. Find orphaned pages (no inbound links)
2. Detect contradictions across pages
3. Flag stale claims (source age > threshold)
4. Verify cross-references resolve
5. Check page type compliance against schema
6. Report as structured JSON with severity levels

### Multi-Tenancy

**Tenant isolation:**
- Each tenant gets its own source store, wiki directory, and schema
- Tenant registry in control plane (YAML or SQLite)
- No cross-tenant data access by default

**Access control:**
- Role-based: `admin` (manage tenants, schemas), `editor` (ingest, lint), `reader` (query only)
- Per-tenant role assignments
- API key or JWT auth at the control plane

**Operation queue:**
- Ingest and lint operations are queued per tenant
- Prevents concurrent wiki mutations within a tenant
- Cross-tenant operations run in parallel

## Template Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ProjectName` | string | (required) | Kebab-case project name |
| `Description` | string | "Multi-tenant LLM-maintained knowledge base" | Short description |
| `StorageProvider` | string | `"git"` | Default wiki storage backend |
| `LlmProvider` | string | `"anthropic"` | Default LLM provider for wiki operations |
| `SourceProvider` | string | `"local"` | Default source ingestion provider |
| `IncludeApi` | bool | `true` | Include HTTP API server (Hono) |
| `IncludeCli` | bool | `true` | Include CLI interface |
| `IncludeTests` | bool | `true` | Include test suite |

## Skeleton Structure

```
src/
├── index.ts                    # entry point — CLI + API bootstrap
├── config.ts                   # Zod-validated config from env
├── logger.ts                   # structured JSON logger
├── metrics.ts                  # OTel instrumentation
│
├── tenant/
│   ├── types.ts                # Tenant, TenantConfig, Role
│   ├── registry.ts             # tenant CRUD, config persistence
│   └── auth.ts                 # role-based access control
│
├── schema/
│   ├── types.ts                # WikiSchema, PageType, StructureConfig
│   ├── parser.ts               # parse + validate wiki-schema.yaml
│   └── default-schema.yaml     # starter schema shipped with template
│
├── sources/
│   ├── types.ts                # Source, SourceProvider interface
│   ├── registry.ts             # provider registry
│   ├── index.ts                # barrel
│   ├── local.ts                # filesystem watcher
│   ├── web.ts                  # URL fetch + readability
│   ├── github.ts               # GitHub API
│   ├── notion.ts               # Notion API
│   ├── slack.ts                # Slack API
│   └── mock.ts                 # in-memory
│
├── wiki/
│   ├── types.ts                # Page, PageMeta, CrossRef, Contradiction
│   ├── page.ts                 # page CRUD, metadata management
│   ├── index-manager.ts        # auto-maintained wiki index
│   ├── link-graph.ts           # cross-reference tracking
│   └── search.ts               # FTS across wiki pages
│
├── storage/
│   ├── types.ts                # StorageProvider interface
│   ├── registry.ts             # provider registry
│   ├── index.ts                # barrel
│   ├── git.ts                  # git-backed storage (default)
│   ├── github.ts               # remote GitHub repo
│   ├── sqlite.ts               # FTS5-indexed
│   └── mock.ts                 # in-memory
│
├── operations/
│   ├── types.ts                # OperationResult, IngestResult, LintResult
│   ├── queue.ts                # per-tenant operation queue
│   ├── ingest.ts               # source → wiki page pipeline
│   ├── query.ts                # search → synthesize → cite
│   └── lint.ts                 # consistency health checks
│
├── llm/
│   ├── types.ts                # LlmProvider interface
│   ├── registry.ts             # provider registry
│   ├── index.ts                # barrel
│   ├── anthropic.ts            # Claude API
│   ├── openai.ts               # OpenAI API
│   └── mock.ts                 # deterministic responses for testing
│
├── api/                        # conditional: IncludeApi
│   ├── server.ts               # Hono HTTP server
│   ├── routes/
│   │   ├── tenants.ts          # tenant CRUD endpoints
│   │   ├── sources.ts          # source ingestion endpoints
│   │   ├── wiki.ts             # wiki query/browse endpoints
│   │   └── admin.ts            # lint, health, metrics
│   └── middleware/
│       └── auth.ts             # JWT/API key validation
│
├── cli/                        # conditional: IncludeCli
│   ├── index.ts                # CLI entry point
│   └── commands/
│       ├── tenant.ts           # tenant create/list/delete
│       ├── ingest.ts           # ingest sources
│       ├── query.ts            # query wiki
│       ├── lint.ts             # run lint checks
│       └── schema.ts           # validate/update schema
│
└── __tests__/                  # conditional: IncludeTests
    ├── ingest.test.ts
    ├── query.test.ts
    ├── lint.test.ts
    ├── tenant.test.ts
    ├── link-graph.test.ts
    └── registry.test.ts
```

## Composition

```yaml
composition:
  pairsWith:
    - agentic-loop        # agents use ingest/query/lint as tool calls
    - eval-harness         # evaluate wiki quality and completeness
    - module-llm-gateway   # route LLM calls through gateway
    - module-auth-ts          # production auth layer
    - module-observability-ts # production monitoring
    - module-search-ts        # advanced search capabilities
    - rag-pipeline         # wiki pages as retrieval targets
    - data-pipeline        # source ingestion from structured data
  nestsInside: [monorepo]
```

## Workshop Integration

The three operations map to a natural workflow pattern:

```
[Input: sources] → [Scaffold: llm-wiki] → [Agent: ingest] → [Agent: lint] → [Gate: review] → [Output: wiki]
```

For ongoing use, a recurring workflow:
```
[Input: new sources] → [Agent: ingest] → [Condition: lint score < threshold] → [Agent: lint-fix] → [Output: updated wiki]
```

Variable bindings let upstream nodes feed source paths, tenant configs, or schema overrides into the scaffold node dynamically.

## Prior Art / Inspiration

- [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the original single-user pattern. This template extends it with multi-tenancy, source provenance, and pluggable providers.
- Existing `module-knowledge-base-ts` in catalog — complementary, not competing. That module integrates with external knowledge bases (Notion, Confluence). This template _is_ the knowledge base, built and maintained by LLMs.
- Existing `rag-pipeline` — different retrieval philosophy. Can work together: wiki pages become high-quality retrieval targets for RAG.

## Implementation Sequence

1. **Core types + schema parser** — tenant, wiki page, source provenance types. Wiki schema YAML parsing with Zod validation.
2. **Storage layer** — git provider first (default), mock for testing. Page CRUD, commit-per-operation.
3. **Source layer** — local filesystem provider first, mock for testing. Source provenance tracking.
4. **Operations** — ingest pipeline (source → LLM → wiki pages), query pipeline (search → synthesize → cite), lint checks.
5. **Tenant isolation** — registry, per-tenant directories, operation queue.
6. **CLI** — tenant/ingest/query/lint commands.
7. **API** — Hono server, REST endpoints, auth middleware.
8. **Additional providers** — web, GitHub, Notion, Slack sources; SQLite, GitHub storage; OpenAI LLM.
