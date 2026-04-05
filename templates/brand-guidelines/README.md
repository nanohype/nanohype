# brand-guidelines

Brand guideline documentation covering color palette definitions, typography scale, logo usage rules, and optional voice and tone guidelines. A structured reference for maintaining brand consistency across all touchpoints and teams.

## What you get

- Color palette definition in YAML with primary, secondary, neutral, and semantic colors
- Typography scale in YAML with font families, weights, sizes, and line heights
- Logo usage guide with placement rules, clear space, and misuse examples
- Optional voice and tone guidelines for written content

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `BrandName` | string | yes | - | Display name of the brand |
| `IncludeVoiceTone` | bool | no | `true` | Include voice and tone guidelines |

## Project layout

```text
<ProjectName>/
  brand/
    color-palette.yaml         # Color definitions with semantic roles
    typography.yaml            # Type scale, font families, and weights
    logo-usage.md              # Logo placement, sizing, and misuse rules
    voice-tone.md              # (optional) Voice and tone writing guidelines
```

## Pairs with

- [design-system](../design-system/) -- design principles and component catalog
- [design-tokens](../design-tokens/) -- token definitions derived from brand values

## Nests inside

- [monorepo](../monorepo/)
