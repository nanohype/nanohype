# battle-cards

Scaffolds a competitive intelligence package with feature comparison matrices, positioning statements, win/loss analysis templates, and objection handling guides. Gives sales and marketing teams structured ammunition for competitive deals.

## What you get

- A feature comparison matrix with scoring across key evaluation criteria
- Positioning statements with differentiators and talking points
- A win/loss analysis template for tracking competitive outcomes
- An objection handling guide with responses and proof points (conditional)

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `CompetitorCount` | int | no | `3` | Number of competitor slots |
| `IncludeObjections` | bool | no | `true` | Include objection handling |

## Project layout

```text
cards/
  comparison-matrix.yaml           # Feature-by-feature competitor scoring
  positioning.md                   # Differentiators and talking points
  win-loss-template.yaml           # Competitive deal outcome tracking
  objection-handling.md            # Responses to common objections (conditional)
```

## Pairs with

- [proposal-template](../proposal-template/) -- competitive context for proposals
- [campaign-brief](../campaign-brief/) -- competitive messaging in campaigns

## Nests inside

- [monorepo](../monorepo/)
