# proposal-template

Scaffolds a client-facing sales proposal with executive summary, solution overview, pricing structure, delivery timeline, and terms. Produces a professional proposal document with supporting data files for pricing and scheduling.

## What you get

- A proposal document with executive summary, problem context, solution, and terms
- A pricing structure with line items, rates, and totals in structured YAML
- A delivery timeline with phases, milestones, and dependencies

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `CompanyName` | string | yes | - | Client company name |
| `ProposalType` | string | no | `services` | Proposal type |

## Project layout

```text
proposal/
  proposal.md                      # Full proposal document
  pricing.yaml                     # Line items, rates, totals
  timeline.yaml                    # Phases, milestones, dependencies
```

## Pairs with

- [battle-cards](../battle-cards/) -- competitive positioning for proposals
- [brand-guidelines](../brand-guidelines/) -- visual consistency in deliverables

## Nests inside

- [monorepo](../monorepo/)
