# brief-campaign-plan

Scaffolds an agent brief for producing a marketing campaign plan. The rendered brief instructs an agent to define campaign strategy, identify distribution channels, craft messaging pillars, set KPIs, and produce a structured campaign plan with timeline and budget allocation.

## What you get

- A structured agent brief that produces a campaign plan
- Audience segmentation with channel preferences and decision-journey mapping
- Channel strategy with role, format, cadence, and budget allocation
- Messaging framework with segment-specific variants
- Content matrix linking assets to channels, segments, and funnel stages
- KPI dashboard with actionable metrics and optimization triggers

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Internal project name |
| `CampaignGoal` | string | yes | - | Primary campaign objective |
| `TargetAudience` | string | yes | - | Target audience segments |
| `Budget` | string | no | `""` | Total campaign budget or range |
| `Timeline` | string | no | `""` | Campaign duration or key dates |

## Project layout

```text
brief-campaign-plan/
  brief.md                         # Agent instruction document
```

## Pairs with

- [campaign-brief](../campaign-brief/) -- campaign brief template
- [content-calendar](../content-calendar/) -- content calendar template

## Nests inside

- [monorepo](../monorepo/)
