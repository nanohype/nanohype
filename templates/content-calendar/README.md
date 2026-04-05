# content-calendar

Scaffolds an editorial content calendar with content pillars, distribution matrix, and publishing cadence. Supports weekly, biweekly, and monthly rhythms with structured planning for multi-channel content programs.

## What you get

- An editorial calendar with scheduled content slots and status tracking
- Content pillars defining thematic areas, target audiences, and goals
- A distribution matrix mapping content types to channels and formats
- A social media playbook with platform-specific guidance (conditional)

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `Cadence` | enum | no | `weekly` | Publishing cadence: weekly, biweekly, or monthly |
| `IncludeSocial` | bool | no | `true` | Include social media playbook |

## Project layout

```text
content/
  editorial-calendar.yaml          # Scheduled content with status tracking
  pillars.md                       # Thematic areas and audience mapping
  distribution-matrix.yaml         # Channel and format mapping
  social-playbook.md               # Platform-specific social guidance (conditional)
```

## Pairs with

- [campaign-brief](../campaign-brief/) -- campaign strategy driving content
- [brand-guidelines](../brand-guidelines/) -- visual and voice consistency

## Nests inside

- [monorepo](../monorepo/)
