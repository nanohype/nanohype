# brief-test-strategy

Scaffolds an agent brief for producing a comprehensive test strategy. The rendered brief instructs an agent to analyze a codebase, identify critical paths, recommend language-specific tooling, and produce a layered test strategy document using the testing trophy model.

## What you get

- A structured agent brief that produces a test strategy document
- Codebase characterization and module-level test-layer affinity mapping
- Layer-by-layer strategy (static analysis, unit, integration, e2e) with tooling recommendations
- Coverage targets differentiated by module criticality
- CI pipeline design with parallelization and failure policies
- Flaky test management workflow

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Name of the project |
| `Language` | string | `typescript` | Primary programming language |
| `TestingGoal` | string | `comprehensive coverage` | High-level testing objective |
| `CriticalPaths` | string | `""` | Comma-separated critical paths to prioritize |

## Project layout

```text
brief-test-strategy/
  brief.md                         # Agent instruction document
```

## Pairs with

- [test-plan](../test-plan/) -- test plan template
- [test-automation](../test-automation/) -- test automation framework
- [eval-harness](../eval-harness/) -- evaluation harness

## Nests inside

- [monorepo](../monorepo/)
