# ci-eval

CI pipeline for eval-gated deployments. Runs LLM evaluation suites on every pull request, compares scores against a stored baseline, posts a markdown report as a PR comment, and fails the check if any suite regresses beyond a configurable threshold.

## What you get

- **GitHub Actions workflow** — triggers on PR to main, runs eval suites, compares against baseline, posts PR comment with results table, fails check on regression. The job federates its GitHub OIDC token into the IAM role the repository variable `EVAL_ROLE_ARN` names, and the `bedrock` provider calls Bedrock under that role, so the repository holds no long-lived credential
- **Providers** — `bedrock` (Converse under the IAM role the run assumes: GitHub OIDC federation on a runner, an AWS profile on a workstation), `gateway` (the Platform's ModelGateway, for a run inside the cluster, with no credential), and with `IncludeKeyProviders` the `anthropic` and `openai` providers, for a provider the intake brief names
- **Eval corpus** — YAML suites under `evals/`. Each case declares a `kind` — `golden` for the behaviour the surface exists to deliver, `adversarial` for input trying to make it do something else — and at least one assertion. The loader refuses an empty corpus, a suite with no cases, and a case with nothing to check, so a run with nothing in it fails rather than reporting what a passing run reports
- **CLI** — `run` executes suites and compares, `compare` checks current results against baseline, `update-baseline` saves current scores as the new baseline
- **Baseline management** — JSON file tracking per-suite scores, with comparison logic that flags regressions beyond a threshold
- **Markdown reporter** — generates PR comment with suite-level pass/fail, score deltas, and expandable details
- **Zod-validated config** — type-safe configuration with sensible defaults

## Variables

| Name                  | Type   | Default                                  | Description                                                                                                                                        |
| --------------------- | ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectName`         | string | _(required)_                             | Kebab-case project name                                                                                                                            |
| `Description`         | string | `CI pipeline for eval-gated deployments` | Short project description                                                                                                                          |
| `EvalPath`            | string | `evals`                                  | Directory containing YAML eval suite files                                                                                                         |
| `RegressionThreshold` | string | `0.05`                                   | Max allowed score regression (0.0–1.0)                                                                                                             |
| `LlmProvider`         | string | `bedrock`                                | Default LLM provider: bedrock on a runner or a workstation, gateway inside the cluster, anthropic or openai with `IncludeKeyProviders`             |
| `PlatformName`        | string | `ProjectName`                            | Platform whose ModelGateway the gateway provider calls                                                                                             |
| `IncludeKeyProviders` | bool   | `false`                                  | Include the anthropic and openai providers, which authenticate with a provider API key, for a provider the intake brief names                      |
| `ProviderCheck`       | string | derived                                  | Derived from `LlmProvider` and `IncludeKeyProviders`; fails the scaffold when `LlmProvider` names a provider the project leaves out. Leave it unset |
| `IncludeTests`        | bool   | `true`                                   | Include unit tests                                                                                                                                 |

## The eval role

The workflow's `bedrock` run assumes the IAM role the repository variable `EVAL_ROLE_ARN` names, through the account's GitHub OIDC provider. The role trusts that provider for the subject `repo:<owner>/<repo>:pull_request` and grants `bedrock:InvokeModel` on the inference profiles the suites grade and the foundation models they route to. `AWS_REGION`, a repository variable, is the region the profiles are invoked in, `us-east-1` when unset. GitHub issues no OIDC token to a pull request from a fork, so a fork's run reaches no model.

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
  providers/            # bedrock, gateway, and with IncludeKeyProviders anthropic and openai
  bootstrap.ts          # Placeholder validation
  logger.ts             # Structured logger
src/__tests__/
  eval-cases.test.ts    # Every way of ending up with nothing to run, as a refusal
  assertions.test.ts    # Assertion registry dispatch, on both outcomes
  runner-cases.test.ts  # Scoring, the per-case failure path, bounded concurrency
  baseline.test.ts      # Compare with regressions, within threshold, no baseline
  reporter.test.ts      # Markdown output format
  runner.test.ts        # Which corpora are accepted, and suite discovery
  bedrock.test.ts       # Converse request, signing, model and region, refusal, timeout
  gateway.test.ts       # Gateway request with no credential, refusal, timeout
  config.test.ts        # The scaffolded provider when LLM_PROVIDER is unset
.eval-baseline.json     # Empty initial baseline
```

## Pairs with

- [eval-harness](../eval-harness/) — standalone eval framework with assertion library
- [ts-service](../ts-service/) — TypeScript service to gate deployments behind evals
- [agentic-loop](../agentic-loop/) — agentic systems that benefit from regression testing

## Nests inside

- [monorepo](../monorepo/) — drops into a monorepo workspace as a standalone package
