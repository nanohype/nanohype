# launch-checklist

Scaffolds a structured launch package with go/no-go criteria organized by functional area, a stakeholder sign-off matrix, monitoring setup guidance, and rollback plan. Optionally includes an internal and external communications plan.

## What you get

- A comprehensive go/no-go checklist with criteria organized by engineering, product, design, QA, security, legal, and operations
- A sign-off matrix defining roles, approval criteria, and sign-off status for each stakeholder
- Monitoring setup guidance with metrics to watch, alert thresholds, and dashboard configuration
- A communications plan with internal and external messaging timelines (conditional)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `LaunchType` | enum | `ga` | Launch phase: alpha, beta, or ga |
| `IncludeComms` | bool | `true` | Include communications plan |

## Project layout

```text
launch/
  checklist.md                     # Go/no-go criteria by functional area
  sign-off-matrix.yaml             # Roles, criteria, approval status
  monitoring-setup.md              # Metrics, thresholds, alerts
  comms-plan.md                    # Communication timeline (conditional)
```

## Pairs with

- [prd-template](../prd-template/) -- product requirements driving the launch
- [campaign-brief](../campaign-brief/) -- marketing alignment for launch messaging
- [release-checklist](../release-checklist/) -- technical release readiness
- [runbook](../runbook/) -- operational procedures for post-launch support

## Nests inside

- [monorepo](../monorepo/)
