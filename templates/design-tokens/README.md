# design-tokens

Design token system with base primitives, semantic aliases, theme configuration, and optional dark mode definitions. Tokens follow a three-tier architecture: base values, semantic mappings, and theme overrides.

## What you get

- Base token definitions with color, spacing, typography, shadow, and radius primitives
- Semantic token layer mapping intent (text-primary, surface-default) to base values
- Theme configuration for managing token resolution across contexts
- Optional dark mode token overrides

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `TokenFormat` | string | `json` | Primary output format |
| `IncludeDarkMode` | bool | `true` | Include dark mode tokens |

## Project layout

```text
<ProjectName>/
  tokens/
    base.json                  # Primitive values — colors, spacing, radii, shadows
    semantic.json              # Intent-based aliases mapping to base tokens
    theme-config.yaml          # Theme resolution rules and output settings
    dark.json                  # (optional) Dark mode semantic overrides
```

## Pairs with

- [design-system](../design-system/) -- consumes tokens for component specifications
- [component-inventory](../component-inventory/) -- references tokens in component metadata
- [brand-guidelines](../brand-guidelines/) -- brand palette values feed base tokens
- [next-app](../next-app/) -- frontend application consuming tokens as CSS variables

## Nests inside

- [monorepo](../monorepo/)
