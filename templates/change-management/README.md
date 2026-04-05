# change-management

Scaffolds a change management package with a change request template, impact assessment matrix, and approval workflow configuration. Optionally includes a rollback plan with triggers and verification steps.

## What you get

- A change request template with description, justification, risk assessment, and testing plan
- An impact assessment matrix with affected systems, dependencies, and risk scoring
- An approval workflow with approval chains by change type, SLAs, and escalation paths
- A rollback plan with trigger criteria, step-by-step procedure, and post-rollback verification (conditional)

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `ChangeType` | enum | no | `normal` | Default change type: standard, normal, or emergency |
| `IncludeRollback` | bool | no | `true` | Include rollback plan |

## Project layout

```text
change/
  request-template.md              # Change request with risk assessment
  impact-assessment.yaml           # Affected systems and risk scoring
  approval-workflow.yaml           # Approval chains by change type
  rollback-plan.md                 # Rollback procedure (conditional)
```

## Pairs with

- [runbook](../runbook/) -- operational procedures for executing changes
- [release-checklist](../release-checklist/) -- release process that triggers change requests
- [compliance-checklist](../compliance-checklist/) -- compliance controls governing changes

## Nests inside

- [monorepo](../monorepo/)
