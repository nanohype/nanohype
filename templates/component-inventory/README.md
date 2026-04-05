# component-inventory

Component inventory with structured status tracking, ownership metadata, and an optional accessibility checklist. A single registry for tracking every UI component from proposal through deprecation.

## What you get

- Component registry in YAML with status, ownership, and framework-specific notes
- Status tracker for monitoring component lifecycle across the system
- Optional accessibility checklist covering WCAG 2.1 AA criteria per component
- Structured format for audit history and review sign-off

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `Framework` | string | no | `react` | Frontend framework |
| `IncludeA11yChecklist` | bool | no | `true` | Include accessibility checklist |

## Project layout

```text
<ProjectName>/
  inventory/
    components.yaml            # Component registry with status and metadata
    status-tracker.yaml        # Lifecycle tracking and review history
  a11y/                        # (optional) Accessibility
    checklist.md               # WCAG 2.1 AA audit checklist per component
```

## Pairs with

- [design-system](../design-system/) -- design principles and component catalog
- [design-tokens](../design-tokens/) -- token definitions consumed by components
- [next-app](../next-app/) -- frontend application implementing the components

## Nests inside

- [monorepo](../monorepo/)
