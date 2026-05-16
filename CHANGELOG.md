# Changelog

## Unreleased

### Templates

- `spring-boot-service` — Java Spring Boot 4 HTTP service on JDK 25 with Spring Web MVC, Actuator, Spring Data JPA + Flyway, Micrometer + OpenTelemetry, structured logging, graceful shutdown.
- `istio-policy` — Istio AuthorizationPolicy + RequestAuthentication bundle for JWT-protected HTTP workloads on a service mesh.
- `module-auth-go` — Composable Go HTTP auth middleware with pluggable providers (JWT/JWKS, Auth0, Clerk, Supabase, API key).
- `module-analytics-ts` — Product analytics with pluggable backends (Segment, PostHog, Mixpanel, Amplitude).
- `module-knowledge-base-ts` — Knowledge base providers (Notion, Confluence, Google Docs, Coda) normalized to markdown.
- `module-llm-providers` — Shared LLM provider pack covering Anthropic, OpenAI, Groq, plus optional Bedrock / Azure / Vertex / HuggingFace / Ollama.
- `module-media-ts` — Media processing and delivery (Cloudinary, Uploadcare, imgix).
- `module-oauth-delegation-ts` — Outbound OAuth 2.0 Authorization Code + PKCE with HMAC-signed state cookies and refresh-before-expiry token storage.
- `module-project-mgmt-ts` — Project management providers (Linear, Jira, Asana, Shortcut).
- `module-search-ts` — Full-text search with pluggable backends (Algolia, Typesense, Meilisearch).
- `module-spring-security` — Drop-in Spring Security module with OIDC JWT resource server, header API keys, and a multi-provider filter chain.
- Persona templates and agent briefs for design, QA, product, marketing, sales, operations, and customer success (see [catalog reference](docs/catalog.md)).

### Composites

- `spring-boot-microservice` — Java service shaped for production on day one.
- `identity-aware-service` — Defense-in-depth identity (Istio + Spring Security).
- `client-engagement`, `product-launch`, `research-to-prototype` — cross-functional composites that span engineering and non-engineering personas.

### Security

- Bumped `markdownlint-cli2` to `^0.22.1`, clearing transitive `js-yaml` (GHSA-mh29-5h37-fv8m) and `markdown-it` (GHSA-38c4-r59v-3vqw) advisories.
- Added `fast-json-patch ^3.1.1` override at the root to clear the `ajv-cli` transitive prototype-pollution advisory (GHSA-8gh8-hqwg-xf34).
- Bumped SDK `vitest` to `^4.1.6`, clearing transitive `vite` path-traversal and WebSocket arbitrary-file-read advisories (GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583) and `postcss` XSS (GHSA-qx2v-qp2m-jg93).

### CI / tooling

- All CI install steps use `npm ci` instead of `npm install` (avoids lockfile drift in CI).
- `mikefarah/yq` action pinned to `v4.53.2` (was tracking `master`).
- SDK CI gains `npm audit --audit-level=high --omit=dev` so production advisories fail PRs.
- `scripts/local-cluster/lib/defaults.sh` and `scripts/template-doctor/lib/report.sh` now set `-euo pipefail` for consistency with the rest of the script set.
- ESLint adopted in `sdk/` with the `typescript-eslint` strict + recommended ruleset. SDK `lint` script now runs `tsc --noEmit && eslint 'src/**/*.ts' '__tests__/**/*.ts'` (previously aliased to typecheck only). Aligns with the rest of the nanohype org's lint posture.

### Docs

- README `Templates` and `Composites` tables refreshed against the catalog. Hardcoded counts removed in favor of a `Cross-Functional Templates` section that links to the catalog reference for the full per-persona breakdown.
- `docs/composites-guide.md` gains entries for `spring-boot-microservice` and `identity-aware-service`.
- `docs/catalog.md` and `templates/electron-app/README.md` no longer reference the retired `armature` design-tokens dependency.

## 1.0.0 — 2026-04-03

Initial release of the nanohype template catalog. Templates span AI Systems, Applications, Infrastructure, and Composable Modules, plus persona-scoped templates and agent briefs.

### SDK

`@nanohype/sdk` — reference implementation with CLI, `GitHubSource`, `LocalSource`, template + composite rendering.

### Documentation

Quick-start guide, composites selection guide, production-readiness checklist, template + composite contract specs, consumer implementation guide, authoring guide, and the catalog reference.
