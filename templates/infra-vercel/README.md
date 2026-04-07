# infra-vercel

Vercel deployment configuration with vercel.json, deploy scripts, and optional CI/CD workflow for preview and production deploys.

## What you get

- `vercel.json` with framework preset and environment variable configuration
- Deploy script with pre-flight checks (auth, project linking)
- Optional GitHub Actions workflow for preview deploys on PR and production deploys on push to main
- Environment variable documentation and `.env.example`

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `Description` | string | `Vercel deployment` | Project description |
| `Framework` | string | `nextjs` | Framework preset for vercel.json |
| `IncludeCi` | bool | `true` | Include GitHub Actions workflow |

## Project layout

```text
<ProjectName>/
  vercel.json               # Vercel project configuration
  scripts/
    deploy.sh               # Deploy with pre-flight checks
  .github/
    workflows/
      deploy.yml            # (optional) CI/CD preview + production deploys
```

## Pairs with

- [next-app](../next-app/) -- deploy Next.js applications
- [ts-service](../ts-service/) -- deploy TypeScript API services

## Nests inside

- [monorepo](../monorepo/)
