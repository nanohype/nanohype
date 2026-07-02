# Contributing

This file covers what's specific to contributing to the catalog — templates,
composites, and the vendored runtime library. The org-wide ground rules (PR
flow, four-phase contract, style, no DCO) live in the
[org CONTRIBUTING](https://github.com/nanohype/.github/blob/main/CONTRIBUTING.md);
this document builds on them. Repo conventions and commands are declared in
[`CLAUDE.md`](CLAUDE.md) — read it first.

---

## Contributing a template

For a detailed walkthrough, see the
[Template Authoring Guide](docs/authoring-guide.md). The formal contract is
the [Template Contract Specification](docs/spec/template-contract.md), and
every `template.yaml` must validate against
[`schemas/template.schema.json`](schemas/template.schema.json).

### 1. Fork and clone

```bash
git clone https://github.com/<your-fork>/nanohype.git
cd nanohype
npm install
```

### 2. Create the template

Create a directory under `templates/` with three components:

```text
templates/<name>/
  template.yaml     # manifest (required)
  skeleton/         # output file tree (required)
  README.md         # documentation (required for catalog listing)
```

Contract essentials:

- `apiVersion: nanohype/v1`; the directory name is kebab-case and matches the
  manifest's `name` field.
- Variable names are PascalCase; placeholders are `__SCREAMING_SNAKE__` and
  unique (no placeholder is a substring of another).
- Every `enum` variable has a non-empty `options` array; conditionals
  reference only `bool`-typed variables.
- Field order, category/persona choices, and README section order follow
  [`CLAUDE.md`](CLAUDE.md) — it is the local law for authoring decisions.

### 3. Meet the skeleton quality bar

The skeleton must produce real, working output when scaffolded with default
values — not stubs filled with TODOs. Concretely:

- **Latest stable library versions**, resolved from the registry at authoring
  time — never hand-written pins from memory.
- **Idiomatic per language** — Go stdlib, Python protocols + type hints,
  TypeScript strict-mode native ESM. No LangChain or heavy frameworks;
  implement patterns directly.
- **Pluggable seams use the provider registry pattern** (interface +
  self-registration + barrel + `getProvider(name)`), with `type: string`
  selection variables so new providers don't require manifest changes.
- **Security is part of working**: parameterized queries (never string
  interpolation for SQL), input validation at system boundaries, secrets from
  environment variables — never in code, error handling at tool/provider
  boundaries.

### 4. Validate locally

```bash
npm run validate:schema                  # JSON Schema, all templates
./scripts/validate.sh templates/<name>   # full validation, single template
npm run validate:catalog                 # catalog-wide validation + summary
npm run verify:catalog                   # catalog.json is regenerated, not hand-edited
```

All of these run in CI as hard gates; run them before pushing. If your
template should appear in `catalog.json`, regenerate it with
`npm run generate:catalog` and commit the result.

### 5. Open the PR

Use this checklist in the PR body:

```markdown
## Template Submission: `<name>`

- [ ] `template.yaml` has `apiVersion: nanohype/v1` and valid semver `version`
- [ ] Directory name matches the `name` field in the manifest
- [ ] All required manifest fields present (name, displayName, description, version, tags, variables)
- [ ] Variables use PascalCase names and unique placeholders
- [ ] Every `enum` variable has a non-empty `options` array
- [ ] Conditionals reference only `bool`-typed variables
- [ ] `skeleton/` produces working output with default values
- [ ] `README.md` included, with a variables reference table
- [ ] `npm run validate:schema` passes
- [ ] `./scripts/validate.sh templates/<name>` passes
- [ ] `npm run validate:catalog` passes
- [ ] Hooks (if any) are idempotent and safe to skip
- [ ] No placeholder is a substring of another placeholder
```

---

## Contributing a composite

Composites are single YAML manifests in `composites/` that stack existing
templates into an integrated project — no `skeleton/` of their own. The
contract is the
[Composite Contract Specification](docs/spec/composite-contract.md);
`validateCompositeManifest()` in `@nanohype/sdk` is the reference validator.

- Exactly one entry is `root: true` (typically `monorepo`); every other entry
  declares the `path` it nests at.
- Every `template:` reference must name a template that exists in this
  catalog — `npm run validate:catalog` checks the references and fails on a
  dangling one.
- Composite-level variables flow into entries explicitly; don't rely on
  templates sharing placeholder names by coincidence.
- Add the composite to the patterns table in
  [`docs/composites-guide.md`](docs/composites-guide.md) so consumers can
  find it.

---

## Contributing to the runtime library

`library/runtime/` is `@nanohype/runtime` — zero-dependency TypeScript
primitives (circuit breaker, retry/timeout, provider registry, WorkOS
Directory client, PII redaction) maintained here as the single source of
truth and **vendored** into consumers as byte-identical copies. Its README
documents the model; the short version:

1. Behavior changes land in `library/runtime/src/` first, with tests.
2. Vendored copies never drift — a copy that differs from its source module
   is the defect. `npm run verify:library` (CI-enforced) checks the vendored
   chart copies today and extends to runtime modules as templates adopt them;
   `npm run sync:library` re-syncs.
3. Never fix a bug in a vendored copy — fix it at the source and re-copy.

```bash
cd library/runtime
npm install
npm run typecheck
npm test
```

---

## SDK changes

`sdk/` is `@nanohype/sdk`, the reference implementation of the rendering
contract. It's a standalone package:

```bash
cd sdk
npm install
npm run typecheck
npm run build
npm test
```

The SDK bundles its own copy of `schemas/template.schema.json`; CI verifies
the two copies stay in sync, so schema changes always land in both places in
the same PR.

---

## Docs and formatting

```bash
npm run format:check   # prettier, org identity
npm run lint:docs      # markdownlint over the docs surface
```

---

## Review criteria

Reviewers evaluate submissions on:

1. **Contract compliance** — the manifest passes schema validation and all
   structural invariants hold.
2. **Skeleton quality** — the scaffolded output compiles, runs, or is
   otherwise valid for its ecosystem, and clears the quality bar above.
3. **Documentation completeness** — the README explains when to use it, what
   it produces, and lists every variable with types and defaults.
4. **Variable design** — well-named, sensible defaults, validation where
   appropriate, logically ordered.
5. **Scope** — it solves a real scaffolding need and doesn't duplicate an
   existing catalog entry.

## Questions?

Open an issue. Manifest format → [template
contract](docs/spec/template-contract.md) / [composite
contract](docs/spec/composite-contract.md); authoring guidance →
[authoring guide](docs/authoring-guide.md); security reports → the
[org security policy](https://github.com/nanohype/.github/blob/main/SECURITY.md)
(private vulnerability reporting, never a public issue).
