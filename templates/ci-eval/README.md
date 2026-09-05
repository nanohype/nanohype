# ci-eval

CI pipeline for eval-gated deployments. Runs LLM evaluation suites on every pull request, compares scores against a stored baseline, posts a markdown report as a PR comment, and fails the check if any suite regresses beyond a configurable threshold.

## What you get

- **GitHub Actions workflow** — triggers on PR to main, runs eval suites, compares against baseline, posts PR comment with results table, fails check on regression
- **Eval corpus** — YAML suites under `evals/`. Each case declares a `kind` — `golden` for the behaviour the surface exists to deliver, `adversarial` for input trying to make it do something else — and at least one assertion. The loader refuses an empty corpus, a suite with no cases, and a case with nothing to check, so a run with nothing in it fails rather than reporting what a passing run reports
- **CLI** — `run` executes suites and compares, `compare` checks current results against baseline, `update-baseline` saves current scores as the new baseline
- **Baseline management** — JSON file tracking per-suite scores, with comparison logic that flags regressions beyond a threshold
- **Markdown reporter** — generates PR comment with suite-level pass/fail, score deltas, and expandable details
- **Zod-validated config** — type-safe configuration with sensible defaults

## Variables

| Name                  | Type   | Default                                  | Description                                |
| --------------------- | ------ | ---------------------------------------- | ------------------------------------------ |
| `ProjectName`         | string | _(required)_                             | Kebab-case project name                    |
| `Description`         | string | `CI pipeline for eval-gated deployments` | Short project description                  |
| `EvalPath`            | string | `evals`                                  | Directory containing YAML eval suite files |
| `RegressionThreshold` | string | `0.05`                                   | Max allowed score regression (0.0–1.0)     |
| `LlmProvider`         | string | `anthropic`                              | Default LLM provider                       |
| `IncludeTests`        | bool   | `true`                                   | Include unit tests                         |

## Project layout

```text
.github/workflows/
  eval.yml              # PR-triggered eval pipeline
evals/
  log-triage.yaml       # Reporting what a CI log says, and what it does not
  pr-report.yaml        # Verdicts, and what must not reach a public PR comment
src/ci-eval/
  index.ts              # CLI entry: run, compare, update-baseline
  cases.ts              # Corpus loader: refuses an empty corpus and an unchecked case
  runner.ts             # createEvalRunner() factory: suite execution and scoring
  baseline.ts           # Load, save, compare baseline scores
  reporter.ts           # Markdown PR comment generator
  types.ts              # EvalResult, SuiteScore, ComparisonResult, BaselineEntry
  config.ts             # Zod validated config
  bootstrap.ts          # Placeholder validation
  logger.ts             # Structured logger
src/__tests__/
  eval-cases.test.ts    # Every way of ending up with nothing to run, as a refusal
  assertions.test.ts    # Assertion registry dispatch, on both outcomes
  runner-cases.test.ts  # Scoring, the per-case failure path, bounded concurrency
  baseline.test.ts      # Compare with regressions, within threshold, no baseline
  reporter.test.ts      # Markdown output format
  runner.test.ts        # Which corpora are accepted, and suite discovery
.eval-baseline.json     # Empty initial baseline
```

## Pairs with

- [eval-harness](../eval-harness/) — standalone eval framework with assertion library
- [ts-service](../ts-service/) — TypeScript service to gate deployments behind evals
- [agentic-loop](../agentic-loop/) — agentic systems that benefit from regression testing

## Nests inside

- [monorepo](../monorepo/) — drops into a monorepo workspace as a standalone package
