# acceptance-criteria

Scaffolds an acceptance criteria framework using Given/When/Then BDD structure with reusable templates, example Gherkin feature files, and an optional definition of done checklist.

## What you get

- A reusable criteria template with Given/When/Then structure and metadata fields
- Example Gherkin feature files for login and checkout flows
- Consistent format for capturing expected behavior across features and user stories
- Optional definition of done checklist with quality gates and completion criteria

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `Format` | string | `gherkin` | Criteria format style |
| `IncludeDoD` | bool | `true` | Include definition of done checklist |

## Project layout

```text
<ProjectName>/
  criteria/
    template.md                # Reusable acceptance criteria template
    examples/
      login.feature            # Login flow example
      checkout.feature         # Checkout flow example
    definition-of-done.md      # DoD checklist (conditional)
```

## Pairs with

- [test-plan](../test-plan/) -- test planning and strategy
- [test-automation](../test-automation/) -- automated test scaffolding
- [prd-template](../prd-template/) -- product requirements

## Nests inside

- [monorepo](../monorepo/)
