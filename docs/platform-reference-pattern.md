# The Platform Reference pattern

The structure described in [`docs/platform-reference.md`](platform-reference.md) is not nanohype-specific. It's a pattern any org can apply to publish a coherent, agent-consumable front door for a multi-repo software stack. This doc is how you'd reuse the pattern for your own project.

## What problem the pattern solves

You have:

1. **Multiple repos** that together constitute a stack — templates, infra, control planes, app catalogs, local dev workspaces, etc.
2. **A reference client** that knows how to use them together (in nanohype's case, `jaunty`)
3. **Stuff you want to keep private** — orchestration, taste, choreography that makes the reference client distinctive
4. **Other potential clients** (Bedrock agents, custom orchestrators, partners, future contractors) you'd like to be able to consume the stack the same way the reference client does — without giving away the private parts

A Platform Reference makes the public consumption path coherent. Anyone reading it learns the bar; only the reference client knows how to consistently hit it.

## The five surfaces

| Surface | What it is | Audience | Mode |
|---|---|---|---|
| **Top-level reference doc** | Single entry point: who it's for, the repos in the stack, the catalog, the standards, the deploy contracts, "build your own client" quickstart | Human readers + agents bootstrapping fresh | Markdown |
| **Catalog manifest** | Machine-readable index of every consumable thing (templates, composites, modules, addons — whatever your stack ships) | Agents doing discovery | JSON |
| **Standards manifests** | The public production bar an external client must obey to produce stack-compatible output | Agents that produce work | JSON + human-readable companion README |
| **Per-repo `AGENTS.md`** | Five-minute orientation per repo: what it gives you, contract surface, "add a new X" recipe, conventions, pointers | Agents about to touch a specific repo | Markdown |
| **SDK + MCP server** | Programmatic surface — discovery functions, loaders for the manifests, an MCP server agents can mount | Programs (agents + tools) | TypeScript package + npm-distributed MCP server |

The five surfaces fit together: the **top-level doc** points at everything else; the **catalog** lets agents discover what exists; the **standards** name the bar; the **AGENTS.md** files are the per-repo deep links; the **SDK/MCP** is how programs read all of it without parsing markdown.

## What to publish (and what not to)

The cut is deliberate. Publish the **guardrails** — the bar that everyone has to meet, expressed as discoverable facts. Keep the **choreography** — the process, weights, role assignments, prompts, orchestration that produces consistent output against the bar.

Heuristic: "Would publishing this let someone replicate my reference client, or just declare they meet the same bar?"

- Replicate → private
- Declare → public

For nanohype the cut landed at:

| Public | Private |
|---|---|
| Toolchain commands per language | The orchestration logic that dispatches them |
| Version-currency policy (EOL, @pin, registries) | The build-verifier's TRANSCRIPTS+CITATIONS evidence contract |
| Platform-tenant contract (Helm chart + ApplicationSet + Platform CR shape) | The 4-role merge-gate choreography that enforces it |
| LLM policy (Bedrock-primary, model tiers, regions) | The factory-preamble prompt that primes every agent |
| Quality-rubric *dimension names* | Rubric weights, per-reviewer assignments, specific REJECT criteria, A–F methodology |
| Per-repo `AGENTS.md` (5-min start) | Internal runbooks, role briefs, taste-encoded instructions |
| Reference client architecture (how it works at a high level) | Reference client source code (how it orchestrates 83 agents) |

The line varies per org. The mechanics — five surfaces, two layers — are the same.

## Mechanical checklist

For an org with N repos:

1. **Pick a stack name and a public domain** (or just use GitHub raw URLs). Decide what your equivalent of `nanohype://` URI scheme is.
2. **Create the catalog manifest schema** (`schemas/catalog.schema.json`). Validate every catalog entry against it. Generate the catalog deterministically from source manifests with a script committed to one repo; verify no drift in CI.
3. **Pick the standards you want to publish**. Start with whichever 3–5 are the easiest commodities and don't reveal your moat. Add more as you build confidence the cut is right.
4. **Author each `standards/<name>.json`** with a uniform envelope (`kind`, `version`, `title`, `summary`, `content`). Schema-validate with a per-kind discriminator.
5. **Write the human-readable normative `standards/README.md`** — same facts, narrative voice, links to the JSON.
6. **Author per-repo `AGENTS.md`** in each consumable repo. Same shape per file: what it gives you / contract surface / add a new X / conventions / pointers. Keep them under ~250 lines each — five-minute orientation is the bar.
7. **Author the top-level `docs/platform-reference.md`** that points at everything. Sections: who it's for, the stack, catalog, standards, deploy contracts, reference client, "build your own client" quickstart, versioning, reusability.
8. **Cross-link every repo's `README.md`** with "AI clients / agents start here: AGENTS.md" + a link to the Platform Reference. One callout per repo, near the top.
9. **Build an SDK** that wraps the catalog + standards + contracts loaders. Reuse the source abstraction pattern (`LocalSource` + `GitHubSource`) so consumers work in both modes.
10. **Build an MCP server** that exposes the loaders as MCP resources + tools. Distribute via npm. Document Claude Desktop + Claude API + Bedrock agent integration snippets in the MCP package's own README.
11. **Document the public/private cut at the org level** — a section in your top-level `CLAUDE.md` (or equivalent) that names what's public, what's private, and the heuristic for new additions.
12. **Add this very doc to your org** so a future maintainer can apply the pattern again.

## Optional but recommended

- **Versioning**: every published manifest carries an integer `version`. Bump on breaking shape change; agents pin to a major range.
- **Catalog freshness check in CI**: `npm run verify:catalog` regenerates `catalog.json` and `git diff --exit-code`s. No drift between source and published manifest.
- **A `templates/platform-reference/` template** in your scaffold catalog that scaffolds this structure for a brand-new org.
- **Per-repo `AGENTS.md` link from `CLAUDE.md`** so Claude Code sessions and external agents converge on the same entry point.
- **Stable public URL** (GitHub Pages / your own domain) for the manifests. Agents fetching from `https://my-org.dev/catalog.json` doesn't care whether the source is git, S3, or Pages — only that the URL is stable across versions.

## What this pattern is NOT

- **It is not a substitute for your reference client.** The reference client is what makes the pattern useful. Without one, you've published documentation; with one, you've published a documented system.
- **It is not a way to open-source your moat.** The cut is the point. Publishing without keeping the choreography private gives up the differentiation that made publishing worthwhile.
- **It is not nanohype-specific.** Substitute "k8s-native stack" with whatever your stack is. The structure carries over.

## Reference implementation

Everything described here is live in this repo. Read in order:

1. [`docs/platform-reference.md`](platform-reference.md) — the top-level doc
2. [`AGENTS.md`](../AGENTS.md) (this repo) — a sample per-repo agent contract
3. [`standards/README.md`](../standards/README.md) + the JSON files — the standards surface
4. [`catalog.json`](../catalog.json) — the catalog manifest
5. [`sdk/`](../sdk/) — the SDK
6. [`mcp-server/`](../mcp-server/) — the MCP server
7. [`/Users/bs/codes/nanohype/CLAUDE.md`](https://github.com/nanohype/nanohype/blob/main/CLAUDE.md) — the org-level public/private cut

Studying those seven files in order is the fastest way to internalize the pattern. Then come back here when you're ready to apply it elsewhere.
