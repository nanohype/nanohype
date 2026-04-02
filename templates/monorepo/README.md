# monorepo

Scaffolds a Turborepo monorepo workspace using pnpm. Includes a shared TypeScript base config, ESLint setup, Turborepo pipeline definitions for build/test/lint/dev, and GitHub Actions CI. Optionally includes shared utility and UI library packages under `packages/`.

## What you get

- A pnpm workspace with Turborepo ^2 orchestrating build, test, lint, and dev tasks
- Shared TypeScript 5.8+ base configuration extended by all packages
- Shared ESLint config with TypeScript and Prettier integration
- GitHub Actions CI workflow with pnpm caching and Turborepo-aware build
- `apps/` directory with a `.gitkeep` placeholder for application packages
- Optional `packages/shared-utils/` with common utility functions
- Optional `packages/shared-ui/` with design tokens and a component scaffold

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `Description` | string | no | `A Turborepo monorepo workspace` | Short project description |
| `PackageManager` | string | no | `pnpm` | Package manager for the workspace |
| `IncludeSharedUi` | bool | no | `false` | Include shared-ui component library |
| `IncludeSharedUtils` | bool | no | `true` | Include shared-utils library |

## Project layout

```text
<ProjectName>/
  package.json                   # Root workspace config
  pnpm-workspace.yaml            # Workspace packages definition
  turbo.json                     # Pipeline config (build, test, lint, dev)
  tsconfig.base.json             # Shared TypeScript config
  .eslintrc.js                   # Shared ESLint config
  .gitignore
  apps/
    .gitkeep                     # Placeholder for app packages
  packages/
    shared-utils/                # (conditional: IncludeSharedUtils)
      package.json
      src/index.ts
      tsconfig.json
    shared-ui/                   # (conditional: IncludeSharedUi)
      package.json
      src/index.ts
      tsconfig.json
  .github/
    workflows/
      ci.yml                     # Turborepo-aware CI
  README.md
```

## Pairs with

This is the container template -- other templates nest inside it.

## Nests inside

Nothing -- this is the top-level workspace.
