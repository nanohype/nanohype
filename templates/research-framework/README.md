# research-framework

Scaffolds a product research framework with hypothesis canvas, interview guides, and synthesis templates. Supports generative and evaluative research workflows with structured outputs that feed directly into PRDs and product strategy.

## What you get

- A hypothesis canvas for framing research questions and assumptions
- An interview guide with warm-up, core, and wrap-up question structures
- A synthesis template for organizing findings into themes and insights
- A competitive analysis matrix with structured competitor profiles (conditional)

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `ResearchType` | string | no | `generative` | Research methodology type |
| `IncludeCompetitive` | bool | no | `true` | Include competitive analysis |

## Project layout

```text
research/
  hypothesis-canvas.md             # Research hypotheses and assumptions
  interview-guide.md               # Structured interview protocol
  synthesis-template.md            # Findings organization and theming
  competitive-analysis.yaml        # Competitor profiles and scoring (conditional)
```

## Pairs with

- [prd-template](../prd-template/) -- translate research into requirements

## Nests inside

- [monorepo](../monorepo/)
