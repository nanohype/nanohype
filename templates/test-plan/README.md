# test-plan

Scaffolds a comprehensive test plan document covering scope, approach, environments, test matrix, risk assessment, and entry/exit criteria.

## What you get

- A structured Markdown test plan with scope, approach, schedule, and entry/exit criteria
- YAML-based test matrix for tracking test cases across environments and configurations
- Optional risk assessment matrix with likelihood/impact scoring and mitigation strategies
- Environment specification section for documenting target platforms and dependencies

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `TestType` | string | no | `functional` | Primary testing type |
| `IncludeRiskMatrix` | bool | no | `true` | Include risk assessment matrix |

## Project layout

```text
<ProjectName>/
  plan/
    test-plan.md               # Main test plan document
    test-matrix.yaml           # Test case matrix with environments
    risk-matrix.md             # Risk assessment (conditional)
```

## Pairs with

- [acceptance-criteria](../acceptance-criteria/) -- BDD acceptance criteria framework
- [test-automation](../test-automation/) -- automated test scaffolding
- [eval-harness](../eval-harness/) -- LLM evaluation framework

## Nests inside

- [monorepo](../monorepo/)
