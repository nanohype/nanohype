# @nanohype/config

Org-canonical tooling presets, maintained here as the single source of truth
and **vendored** into consumers — the same consumption model as
`library/runtime` and the `tenant-chart-base` library chart.

## Files

| File              | What it is                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prettierrc.json` | The org Prettier settings (printWidth 100, 2-space, single quotes, LF). Vendored as each consumer's `.prettierrc.json`                                                 |
| `eslint.base.mjs` | The org ESLint flat-config base: `@eslint/js` recommended + typescript-eslint `strict`, the shared `no-unused-vars` underscore convention, `no-non-null-assertion` off |

## Consumption model: vendor and sync

Consumers do not install this as a package. They **copy the files** into
their own tree, because standalone tenant apps and public repos must stay
self-contained — there is no shared package registry between them.

The contract, mirroring `library/runtime`:

1. **This directory is the single source of truth.** Preset changes land here
   first.
2. **Copies are byte-identical to their source file.** Each copy carries the
   header naming this directory so its provenance is greppable.
3. **Fixes propagate outward, never inward.** A copy that drifts from the
   source is the defect — `scripts/sync-vendored.mjs --check` gates CI in
   every consumer that can assume a nanohype checkout.

How each kind of repo consumes the presets:

- **This repo** (`sdk/`, `mcp-server/`, the root) extends the files directly
  by relative path — root `package.json` points `"prettier"` at
  `prettierrc.json`, and each workspace's `eslint.config.js` re-exports
  `eslint.base.mjs`. No vendoring inside the source repo.
- **Tenant apps** (`competitive-intelligence`, `digest-pipeline`,
  `incident-response`, `slack-knowledge-bot`) and **eks-agent-platform**
  vendor `.prettierrc.json` + `eslint.base.mjs` via their
  `scripts/sync-vendored.mjs` (driven by `scripts/vendored.json`, itself
  vendored from `library/scripts/sync-vendored.mjs`), and their CI drift
  gate fails on any divergence. The repo's own `eslint.config.*` stays a
  thin file: import the vendored base, layer repo-specific plugins and
  ignores on top.
- **Standalone public repos** (`fab`, `nanohype.dev`) must be cloneable
  without a sibling nanohype checkout, so they carry a byte-identical copy
  without a CI drift gate — the header comment names this directory as the
  place to re-copy from.

Repo-specific needs (extra plugins, type-aware rule layers, framework
configs, Prettier overrides) belong in the consumer's thin config on top of
the base, never in a local edit of the vendored copy.

## Development

Presets have no build step. Changing one means re-syncing every consumer:
run `npm run sync:vendored` in each tenant repo (and re-copying into the
standalone repos), then let each repo's own lint/format gates prove the
change holds across the org.
