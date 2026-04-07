# brief-prd

Scaffolds an agent brief for drafting a product requirements document. The rendered brief instructs an agent to decompose a problem space, define requirements, write user stories, establish success metrics, and produce a complete PRD ready for engineering handoff.

## What you get

- A structured agent brief that produces a product requirements document
- Problem decomposition with root-cause analysis and user impact mapping
- Functional and non-functional requirements with testable acceptance criteria
- User stories grouped into epics with MoSCoW prioritization
- Success metrics with baselines, targets, and measurement methods
- Assumption register and risk matrix

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Internal project codename |
| `ProductName` | string | (required) | Customer-facing product name |
| `ProblemStatement` | string | (required) | Core problem this product addresses |
| `TargetAudience` | string | `""` | Primary user segments or personas |
| `ExistingResearch` | string | `""` | Links or references to existing research |

## Project layout

```text
brief-prd/
  brief.md                         # Agent instruction document
```

## Pairs with

- [prd-template](../prd-template/) -- PRD document template
- [research-framework](../research-framework/) -- user research framework

## Nests inside

- [monorepo](../monorepo/)
