# qbr-template

Scaffolds a Quarterly Business Review package with account health dashboards, usage metrics frameworks, expansion opportunity tracking, and risk assessments. Supports quarterly and monthly review cadences for structured customer engagement.

## What you get

- A QBR presentation template with executive summary, wins, and action items
- A metrics framework defining health indicators, usage signals, and benchmarks
- A risk assessment matrix with likelihood, impact, and mitigation plans
- Expansion opportunity tracking for upsell and cross-sell pipeline (conditional)

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `ReviewCadence` | enum | no | `quarterly` | Review cadence: quarterly or monthly |
| `IncludeExpansion` | bool | no | `true` | Include expansion tracking |

## Project layout

```text
qbr/
  template.md                      # QBR presentation template
  metrics-framework.yaml           # Health and usage metrics
  risk-assessment.yaml             # Risk matrix with mitigations
  expansion-tracking.yaml          # Upsell/cross-sell pipeline (conditional)
```

## Pairs with

- [onboarding-playbook](../onboarding-playbook/) -- onboarding context for new accounts
- [prd-template](../prd-template/) -- product roadmap context for reviews

## Nests inside

- [monorepo](../monorepo/)
