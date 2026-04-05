# campaign-brief

Scaffolds a marketing campaign brief with objectives, audience segments, messaging matrix, channel plan, and timeline. Provides a structured package that aligns creative, media, and stakeholders around campaign strategy and execution.

## What you get

- A campaign brief document with objectives, audience, creative direction, and budget
- A messaging matrix mapping audience segments to value propositions and proof points
- A channel plan with platform-specific tactics and budget allocation
- A campaign timeline with phases, milestones, and deliverable deadlines

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `CampaignName` | string | yes | - | Human-readable campaign name |
| `Channel` | string | no | `multi` | Primary distribution channel |

## Project layout

```text
campaign/
  brief.md                         # Campaign brief document
  messaging-matrix.yaml            # Audience-to-message mapping
  channel-plan.yaml                # Channel tactics and budget
  timeline.yaml                    # Phases, milestones, deliverables
```

## Pairs with

- [content-calendar](../content-calendar/) -- editorial execution of campaign content
- [prd-template](../prd-template/) -- product context for launch campaigns
- [brand-guidelines](../brand-guidelines/) -- visual and voice consistency

## Nests inside

- [monorepo](../monorepo/)
