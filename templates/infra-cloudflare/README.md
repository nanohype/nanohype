# infra-cloudflare

Cloudflare Workers deployment configuration with wrangler.toml, TypeScript entry point, deploy scripts, and optional CI/CD workflow for preview and production deploys.

## What you get

- `wrangler.toml` with Worker name, route configuration, and commented R2/D1 binding sections
- TypeScript fetch handler entry point with request routing and JSON responses
- Deploy script with environment selection (preview or production)
- Optional GitHub Actions workflow for preview deploys on PR and production deploys on push to main
- Environment variable documentation and `.env.example`

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | -- | Kebab-case project name |
| `Description` | string | no | `Cloudflare Workers deployment` | Project description |
| `IncludeR2` | bool | no | `false` | Include R2 storage bindings |
| `IncludeD1` | bool | no | `false` | Include D1 database bindings |
| `IncludeCi` | bool | no | `true` | Include GitHub Actions workflow |

## Project layout

```text
<ProjectName>/
  wrangler.toml                 # Worker config with route and bindings
  src/
    index.ts                    # Worker fetch handler entry point
  scripts/
    deploy.sh                   # Deploy with environment selection
  .github/
    workflows/
      deploy.yml                # (optional) CI/CD preview + production
  .env.example
  .gitignore
  README.md
```

## Pairs with

- [ts-service](../ts-service/) -- TypeScript service patterns
- [monitoring-stack](../monitoring-stack/) -- observability for edge functions

## Nests inside

- [monorepo](../monorepo/)
