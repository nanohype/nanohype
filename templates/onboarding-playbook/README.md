# onboarding-playbook

Scaffolds a customer onboarding playbook with milestone definitions, success criteria, health checks, and sales-to-CS handoff checklists. Supports self-serve, guided, and enterprise onboarding workflows with proactive account management.

## What you get

- A playbook document with phase-by-phase onboarding guidance and success criteria
- Milestone definitions with due dates, owners, and completion criteria
- A sales-to-CS handoff checklist ensuring clean account transitions
- A health scoring model for proactive risk identification (conditional)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `ProductName` | string | (required) | Human-readable product name |
| `OnboardingType` | enum | `guided` | Workflow: self-serve, guided, or enterprise |
| `IncludeHealthScoring` | bool | `true` | Include health scoring model |

## Project layout

```text
onboarding/
  playbook.md                      # Phase-by-phase onboarding guide
  milestones.yaml                  # Milestone definitions and criteria
  handoff-checklist.md             # Sales-to-CS transition checklist
  health-scoring.yaml              # Account health model (conditional)
```

## Pairs with

- [qbr-template](../qbr-template/) -- ongoing account reviews after onboarding
- [prd-template](../prd-template/) -- product context for onboarding design

## Nests inside

- [monorepo](../monorepo/)
