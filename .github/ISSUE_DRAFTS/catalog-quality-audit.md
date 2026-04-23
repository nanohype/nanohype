# Catalog Quality Audit — 2026-04-05

Comprehensive quality check across build health, SDK correctness, security, architecture, systems thinking, and design pattern consistency. All findings verified with file:line evidence.

---

## CRITICAL

### 1. `LocalSource.walkDir` does not filter `node_modules/`

`sdk/src/sources/local.ts:136-161` reads ALL files recursively from skeleton directories with no `.gitignore` filtering or `node_modules` exclusion. Two skeletons have local (gitignored, not tracked) `node_modules/` from dev that would be included in scaffolded output when using LocalSource against a local checkout. Also breaks `validate.sh` locally with SIGPIPE (exit 141).

- `templates/module-llm-gateway/skeleton/node_modules/` (130MB, gitignored)
- `templates/llm-wiki/skeleton/node_modules/` (98MB, gitignored)

**Fix:** Add `node_modules` exclusion to `walkDir`. Delete stray local directories.

---

## HIGH

### 2. No fetch timeouts catalog-wide

Only `api-gateway` uses `AbortController` with timeout on `fetch()`. Every other template's external calls can hang indefinitely — circuit breakers don't help because a hung connection never errors (the CB never sees a failure to count).

Affected (non-exhaustive):

- `module-knowledge-base-ts/.../providers/{notion,confluence,coda,google-docs}.ts`
- `module-search-ts/.../providers/{algolia,meilisearch,typesense}.ts`
- `module-analytics-ts/.../providers/{mixpanel,amplitude,posthog,segment}.ts`
- `module-media-ts/.../providers/{uploadcare,cloudinary}.ts`
- `module-project-mgmt-ts/.../providers/{jira,asana,linear,shortcut}.ts`
- `module-vector-store/.../providers/qdrant.ts:143`
- `module-webhook-ts/.../sender.ts:107`
- `data-pipeline/.../ingest/web.ts:25`
- `a2a-agent/.../protocol/{client,transport/http}.ts`

**Fix:** Add `AbortSignal.timeout()` to all `fetch()` calls in provider files. Standardize timeout config per provider.

---

## MEDIUM

### SDK validator gaps

**3. Placeholder substring check missing** — `sdk/src/validator.ts:36-43` checks for duplicate placeholders but not substrings. Spec invariant 3 unenforced. Combined with `renderer.ts:65-73` applying substitutions in array order, substring overlaps silently corrupt output.

**4. Default value type validation missing** — validator doesn't check that `default` values match their declared `type`. A manifest with `type: bool, default: "yes"` passes.

**5. Circular reference detection incomplete** — `sdk/src/resolver.ts:41` catches `A→A` but not `A→B→A`. MAX_RESOLVE_PASSES (10) exits silently with unresolved `${...}` tokens.

**6. No JSON Schema validation in SDK** — `validateManifest()` runs structural checks only, not the full `template.schema.json`. Variable name patterns (`^[A-Z][a-zA-Z0-9]*$`) only enforced by the schema, not the SDK.

### Security

**7. Google Docs query injection** — `templates/module-knowledge-base-ts/.../google-docs.ts:384` escapes single quotes but not backslashes. Lines 387, 423: `parentId` interpolated with zero escaping. Line 319: `parentId` in URL path without validation.

### Architecture

**8. 12 templates missing circuit breakers** — These templates make external API calls without circuit-breaker protection: slack-bot, discord-bot, next-app, a2a-agent, eval-harness, ci-eval, vscode-ext, chrome-ext, electron-app, multimodal-pipeline, fine-tune-pipeline, llm-wiki.

**9. Three different `registerProvider` signatures** — Factory-based `(name, factory)` in 8 templates, instance-based `(provider)` in 6 templates, instance-based `(name, provider)` in 4 templates. CLAUDE.md documents factory as canonical. Instance variants allow shared mutable state.

**10. `ci-eval` violates catalog patterns** — `ci-eval/.../runner.ts:15-16` imports both Anthropic and OpenAI SDKs directly in domain logic. Uses switch statements (`runner.ts:93`, `runner.ts:116`) for provider dispatch and assertion evaluation where every other template uses registries.

**11. Module-level mutable singletons in `agentic-loop`** — `templates/agentic-loop/.../anthropic.ts:15-16` creates module-level `client` and circuit breaker shared across all callers.

### Docs

**12. Authoring guide contradicts CLAUDE.md** — `docs/authoring-guide.md:72` shows `license: MIT` (should be Apache-2.0). Lines 405-415 list wrong README sections (omits "Project layout", "Pairs with", "Nests inside"; includes "When to use this template", "Hooks", "Prerequisites", "Example usage").

**13. `validate:catalog` not in CI** — Catalog-level checks (persona values, cross-references, composite validation) only run locally. CI only runs per-template `validate.sh`.

---

## LOW

| # | Finding | Location |
|---|---------|----------|
| 14 | `lint-docs.yml` uses `continue-on-error: true` — lint failures invisible | `.github/workflows/lint-docs.yml:29` |
| 15 | `quick-start.md` claims universal Zod config validation — false for agentic-loop, mcp-server-ts, Go/Python templates | `docs/quick-start.md:91` |
| 16 | `production-readiness.md` claims template READMEs link to it — none do | `docs/production-readiness.md:1-2` |
| 17 | 3 undocumented composites | `client-engagement.yaml`, `product-launch.yaml`, `research-to-prototype.yaml` |
| 18 | pgvector duplicate `vectorStr` param | `templates/rag-pipeline/.../pgvector.ts:90` |
| 19 | Duplicate root scripts `validate` and `validate:all` are identical | `package.json:26,28` |
| 20 | `format:check` missing from 9 template skeletons | api-gateway, discord-bot, infra-aws, monorepo, next-app, prompt-library, slack-bot, ts-service, worker-service |
| 21 | tsconfig `isolatedModules`/`verbatimModuleSyntax` in 5 templates, absent in rest | agentic-loop, rag-pipeline, a2a-agent, data-pipeline, multimodal-pipeline |
| 22 | Variable table header format: 4-column vs 5-column across READMEs | Cosmetic inconsistency |
| 23 | Unresolved `${VarName}` references silently produce empty strings | `sdk/src/resolver.ts:43` |
| 24 | `multimodal-pipeline` hardcodes OpenAI for audio processing | `processors/audio.ts:11` imports OpenAI directly, bypasses provider pattern |

---

## What's Clean

- All 84 templates pass schema validation
- All composite template references resolve
- All template directory names match manifest `name` fields
- No SQL injection — all queries parameterized
- No command injection — only `execFile` (no shell), no `eval`
- No `.env` files, private keys, or credentials committed
- No cross-template skeleton references
- All READMEs have correct sections in correct order
- All variable tables match their `template.yaml`
- Test naming (`*.test.ts` in `__tests__/`) is universal
- No anemic domain models — all sampled templates separate domain from infrastructure
- No empty catch blocks — all silent catches are intentional and commented
- Only 10 `as any` occurrences catalog-wide, all justified
- Zero `@ts-ignore` anywhere
- Error messages are actionable with available alternatives listed
- Retry loops all bounded with `maxRetries`
- Clean adapter boundaries in module templates (external types stay in providers)
