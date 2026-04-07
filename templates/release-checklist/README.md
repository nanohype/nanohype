# release-checklist

Scaffolds a structured release checklist covering pre-release validation, deployment verification, rollback criteria, and a sign-off matrix with role-based approval tracking.

## What you get

- Pre-release validation checklist with quality gates and environment readiness checks
- Deployment verification steps for smoke tests, health checks, and monitoring confirmation
- YAML-based sign-off matrix with role assignments, approval status, and timestamps
- Release-type-aware sections that scale validation depth to major/minor/patch scope
- Optional rollback plan with triggers, procedures, and communication templates

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `ReleaseType` | enum | `minor` | Release type: major, minor, or patch |
| `IncludeRollback` | bool | `true` | Include rollback plan |

## Project layout

```text
<ProjectName>/
  release/
    checklist.md               # Main release checklist
    sign-off-matrix.yaml       # Role-based sign-off tracking
    verification.md            # Deployment verification steps
    rollback-plan.md           # Rollback procedures (conditional)
```

## Pairs with

- [test-plan](../test-plan/) -- test planning and strategy
- [monitoring-stack](../monitoring-stack/) -- post-deployment monitoring

## Nests inside

- [monorepo](../monorepo/)
