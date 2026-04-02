# GitHub Metadata Recommendations

Internal reference for configuring the nanohype GitHub organization and its repositories.

> **Note:** The org profile README lives in the separate `nanohype/.github` repo at `profile/README.md`, not in this repo.

---

## Repo Description (nanohype/nanohype)

The one-liner shown on the GitHub repo page and in search results:

```text
Template catalog for AI subsystems — MCP servers, agentic loops, RAG pipelines, and CLI tooling. Production patterns, scaffoldable.
```

## Repo Topics

Apply these topics to `nanohype/nanohype` for discoverability. Order does not affect GitHub, but primary terms are listed first for our reference.

```text
ai
mcp
mcp-server
templates
scaffolding
agents
agentic-systems
rag
retrieval-augmented-generation
cli
ai-infrastructure
llm
llm-tools
tool-calling
evaluation
developer-tools
boilerplate
reference-architecture
```

For future repos, always include `ai` and `nanohype` as baseline topics, then add domain-specific tags.

## Social Preview

GitHub displays a 1280x640 image as the social preview (link cards on Twitter, Slack, etc.).

- Use a clean, typographic card: "nanohype" wordmark + tagline on a dark background
- No stock imagery or clip art -- keep it minimal
- Recommended format: PNG or JPG, exactly 1280x640
- Set via repo Settings > Social preview

Until a custom image is uploaded, GitHub auto-generates a preview from the repo name and description. The auto-generated version is acceptable short-term.

## Pinned Repos Strategy

GitHub orgs can pin up to 6 repositories on the org profile page. Current state: pin `nanohype` as the sole repo.

As the org grows, pin repos in this priority order:

1. **nanohype** -- the template catalog (always pinned, flagship)
2. **MCP server repos** -- concrete, runnable tools demonstrate capability immediately
3. **CLI tools** -- same logic; tangible, installable artifacts
4. **Reference implementations** -- full agentic systems or RAG pipelines if open-sourced
5. **Evaluation / testing tools** -- shows rigor
6. **Client-approved showcase repos** -- real work, with permission

Avoid pinning internal tooling, forks, or work-in-progress repos.

## README Badges (Future)

Add badges to the `nanohype/nanohype` repo README once the corresponding infrastructure is in place. Do not add badges that link to nothing.

Candidates:

```markdown
<!-- CI -->
[![CI](https://github.com/nanohype/nanohype/actions/workflows/ci.yml/badge.svg)](https://github.com/nanohype/nanohype/actions/workflows/ci.yml)

<!-- License -->
[![License](https://img.shields.io/github/license/nanohype/nanohype)](LICENSE)

<!-- Template count — update manually or use a dynamic badge -->
<!-- [![Templates](https://img.shields.io/badge/templates-COUNT-blue)]() -->
```

Add these only when:

- A CI workflow exists and passes reliably
- The license badge points to a merged LICENSE file (already done -- can add now)
- The template count is non-zero and maintained

For new repos, keep badge sets minimal: CI status + license is sufficient.
