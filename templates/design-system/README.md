# design-system

Design system specification with foundational principles, a component catalog structure, usage guidelines, and optional token sync configuration. Provides the structural backbone for a consistent visual language across products and teams.

## What you get

- Design principles document defining the system's visual and interaction philosophy
- Component catalog in YAML with status tracking, anatomy, and variant definitions
- Usage guidelines covering when and how to apply the system
- Optional token sync configuration for automated design-to-code export

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `DesignToolkit` | string | no | `figma` | Primary design tool |
| `IncludeTokenSync` | bool | no | `true` | Include token sync config |
| `ColorScheme` | enum | no | `both` | Color scheme: light, dark, or both |

## Project layout

```text
<ProjectName>/
  docs/
    principles.md              # Design principles and philosophy
    usage-guidelines.md        # When and how to apply the system
  components/
    catalog.yaml               # Component inventory with status and variants
  sync/                        # (optional) Token sync
    token-sync-config.yaml     # Automated design-to-code token export
```

## Pairs with

- [design-tokens](../design-tokens/) -- token definitions consumed by the sync config
- [component-inventory](../component-inventory/) -- detailed component tracking and a11y
- [next-app](../next-app/) -- frontend application consuming the system

## Nests inside

- [monorepo](../monorepo/)
