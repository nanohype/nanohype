# prd-template

Scaffolds a structured Product Requirements Document with problem statement, user stories, success metrics, constraints, and milestones. Produces a complete requirements package that aligns engineering, design, and stakeholders around what to build and why.

## What you get

- A PRD document with problem statement, goals, scope, constraints, and milestones
- User stories organized by persona with acceptance criteria (conditional)
- Success metrics defined as measurable KPIs with targets and baselines (conditional)
- Placeholder-driven naming so every document references your project consistently

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `ProductName` | string | yes | - | Human-readable product name |
| `IncludeUserStories` | bool | no | `true` | Include user stories document |
| `IncludeMetrics` | bool | no | `true` | Include success metrics YAML |

## Project layout

```text
prd/
  prd.md                           # Core PRD document
  user-stories.md                  # User stories by persona (conditional)
  success-metrics.yaml             # Measurable KPIs and targets (conditional)
```

## Pairs with

- [research-framework](../research-framework/) -- product research to inform requirements
- [campaign-brief](../campaign-brief/) -- marketing alignment on product launches

## Nests inside

- [monorepo](../monorepo/)
