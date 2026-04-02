# __PROJECT_NAME__

__DESCRIPTION__

## Getting started

```bash
pnpm install
pnpm build
pnpm dev
```

## Project structure

```
__PROJECT_NAME__/
  apps/             # Application packages
  packages/         # Shared library packages
  turbo.json        # Turborepo pipeline configuration
  tsconfig.base.json
```

## Commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Start all packages in dev/watch mode |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests across all packages |
| `pnpm format` | Format code with Prettier |
| `pnpm clean` | Remove all build artifacts and node_modules |

## Adding a new package

1. Create a directory under `apps/` or `packages/`
2. Add a `package.json` with the workspace-scoped name (`@__PROJECT_NAME__/<name>`)
3. Add a `tsconfig.json` that extends `../../tsconfig.base.json`
4. Turborepo will automatically pick it up via the workspace configuration
