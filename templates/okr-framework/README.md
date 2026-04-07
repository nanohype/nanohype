# okr-framework

Scaffolds an OKR structure with company, team, and individual levels, key result templates, review cadence configuration, and scoring calibration. Optionally includes a scoring rubric with calibration examples.

## What you get

- An OKR framework document with principles, guidance on writing effective OKRs, and worked examples
- A structured OKR template with objectives, key results, and linked initiatives at company/team/individual levels
- Review cadence configuration with check-in schedules and review process definitions
- A scoring rubric with 0-1.0 scale calibration examples (conditional)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `OrgName` | string | (required) | Organization name |
| `Cadence` | enum | `quarterly` | Review cadence: quarterly or monthly |
| `IncludeScoring` | bool | `true` | Include scoring rubric |

## Project layout

```text
okrs/
  framework.md                     # OKR principles and worked examples
  template.yaml                    # Structured OKR template with levels
  review-cadence.yaml              # Check-in schedule and review process
  scoring-rubric.md                # Scoring guide with calibration (conditional)
```

## Pairs with

- [prd-template](../prd-template/) -- product requirements aligned to OKRs
- [research-framework](../research-framework/) -- research informing objective setting

## Nests inside

- [monorepo](../monorepo/)
