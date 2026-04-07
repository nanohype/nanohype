# ci-eval

CI pipeline for eval-gated deployments. Runs LLM evaluation suites on every pull request, compares scores against a stored baseline, posts a markdown report as a PR comment, and fails the check if any suite regresses beyond a configurable threshold.

## What you get

- **GitHub Actions workflow** — triggers on PR to main, runs eval suites, compares against baseline, posts PR comment with results table, fails check on regression
- **CLI** — `run` executes suites and compares, `compare` checks current results against baseline, `update-baseline` saves current scores as the new baseline
- **Baseline management** — JSON file tracking per-suite scores, with comparison logic that flags regressions beyond a threshold
- **Markdown reporter** — generates PR comment with suite-level pass/fail, score deltas, and expandable details
- **Zod-validated config** — type-safe configuration with sensible defaults

## Variables

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `ProjectName` | string | *(required)* | Kebab-case project name |
| `Description` | string | `CI pipeline for eval-gated deployments` | Short project description |
| `EvalPath` | string | `evals` | Directory containing YAML eval suite files |
| `RegressionThreshold` | string | `0.05` | Max allowed score regression (0.0–1.0) |
| `LlmProvider` | string | `anthropic` | Default LLM provider |
| `IncludeTests` | bool | `true` | Include unit tests |

## Project layout

```text
.github/workflows/
  eval.yml              # PR-triggered eval pipeline
src/ci-eval/
  index.ts              # CLI entry: run, compare, update-baseline
  runner.ts             # createEvalRunner() factory: suite discovery, LLM execution, scoring
  baseline.ts           # Load, save, compare baseline scores
  reporter.ts           # Markdown PR comment generator
  types.ts              # EvalResult, SuiteScore, ComparisonResult, BaselineEntry
  config.ts             # Zod validated config
  bootstrap.ts          # Placeholder validation
  logger.ts             # Structured logger
src/__tests__/          # (conditional on IncludeTests)
  baseline.test.ts      # Compare with regressions, within threshold, no baseline
  reporter.test.ts      # Markdown output format
  runner.test.ts        # Suite discovery, score collection
.eval-baseline.json     # Empty initial baseline
```

## Pairs with

- [eval-harness](../eval-harness/) — standalone eval framework with assertion library
- [ts-service](../ts-service/) — TypeScript service to gate deployments behind evals
- [agentic-loop](../agentic-loop/) — agentic systems that benefit from regression testing

## Nests inside

- [monorepo](../monorepo/) — drops into a monorepo workspace as a standalone package
