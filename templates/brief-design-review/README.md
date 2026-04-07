# brief-design-review

Scaffolds an agent brief for conducting a comprehensive design review. The rendered brief instructs an agent to audit visual consistency, design token coverage, accessibility compliance, and component coherence against a design system.

## What you get

- A structured agent brief that produces a design review findings report
- Audit coverage across visual consistency, token gaps, component coherence, accessibility, responsive behavior, and interaction patterns
- Severity-rated findings with specific locations and actionable recommendations
- Prioritized remediation plan organized by impact-to-effort ratio
- WCAG 2.1 AA accessibility scorecard

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Name of the project under review |
| `DesignSystemUrl` | string | `""` | URL to the design system documentation or Figma library |
| `TargetPlatform` | string | `web` | Primary platform being reviewed |
| `AuditScope` | string | `full` | Scope of the review |

## Project layout

```text
brief-design-review/
  brief.md                         # Agent instruction document
```

## Pairs with

- [design-system](../design-system/) -- design system template
- [design-tokens](../design-tokens/) -- design token definitions
- [component-inventory](../component-inventory/) -- component catalog

## Nests inside

- [monorepo](../monorepo/)
