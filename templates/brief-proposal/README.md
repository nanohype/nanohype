# brief-proposal

Scaffolds an agent brief for drafting a client-facing proposal. The rendered brief instructs an agent to analyze client needs, design a solution approach, structure pricing and timeline, and produce a polished proposal document ready for client delivery.

## What you get

- A structured agent brief that produces a client-facing proposal
- Client needs analysis with problem framing in the client's language
- Solution design tied to specific identified needs
- Phase-by-phase methodology with entry and exit criteria
- Transparent pricing structure aligned to engagement type
- Risk register covering technical, organizational, and process risks

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Internal project name |
| `CompanyName` | string | (required) | Your company name |
| `ClientName` | string | (required) | Client organization name |
| `EngagementType` | string | `services` | Type of engagement |
| `ClientContext` | string | `""` | Background on the client's situation |

## Project layout

```text
brief-proposal/
  brief.md                         # Agent instruction document
```

## Pairs with

- [proposal-template](../proposal-template/) -- proposal document template
- [battle-cards](../battle-cards/) -- competitive battle cards

## Nests inside

- [monorepo](../monorepo/)
