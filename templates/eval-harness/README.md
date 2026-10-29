# eval-harness

Standalone TypeScript evaluation framework for testing LLM outputs. Define eval suites in YAML, run them against Bedrock from a CI runner or a workstation under an IAM role the run assumes, or against the Platform's ModelGateway from inside the cluster, and get structured pass/fail reports.

## What you get

- Core eval runner with YAML-based suite definitions
- Corpus loader that refuses an empty or one-sided corpus, so a run with nothing to run cannot report a pass
- Golden and adversarial starter suites: format and grounding cases, plus planted instructions, credential probing, contradictory instructions, and a truncated record
- Composable assertion library: string matching, regex, JSON Schema, token limits, custom predicates
- Console reporter (color-coded) and JSON reporter (CI-friendly)
- A `bedrock` provider that calls Converse under the IAM role the run assumes (GitHub OIDC federation on a runner, an AWS profile on a workstation), and a `gateway` provider that calls the Platform's ModelGateway with no credential
- CLI entrypoint with suite glob, concurrency, and reporter selection
- Optional GitHub Actions workflow for running evals on PRs, which federates the job's GitHub OIDC token into the IAM role the repository variable `EVAL_ROLE_ARN` names

## Variables

| Variable       | Type   | Default                  | Description                                                                        |
| -------------- | ------ | ------------------------ | ---------------------------------------------------------------------------------- |
| `ProjectName`  | string | `my-evals`               | Kebab-case project name                                                            |
| `Description`  | string | `LLM evaluation harness` | Project description                                                                |
| `LlmProvider`  | string | `bedrock`                | Default provider: bedrock on a runner or a workstation, gateway inside the cluster |
| `PlatformName` | string | `${ProjectName}`         | Platform whose ModelGateway the gateway provider calls                             |
| `IncludeCi`    | bool   | `true`                   | Include GitHub Actions eval workflow                                               |

## Project layout

```text
<ProjectName>/
  src/
    corpus.ts              # Suite discovery; refuses an empty corpus
    runner.ts              # Core eval orchestrator
    suite.ts               # EvalSuite class (loads from YAML)
    case.ts                # EvalCase with Zod schemas
    assertions.ts          # Assertion registry and built-ins
    reporters/
      console.ts           # Terminal output
      json.ts              # Structured JSON output
    providers/
      bedrock.ts           # Bedrock Converse under an assumed IAM role
      gateway.ts           # Platform ModelGateway, no credential
      index.ts             # Provider factory
  suites/
    example.yaml           # Golden cases
    adversarial.yaml       # Adversarial cases
  bin/
    run-evals.ts           # CLI entrypoint
```

## Pairs with

- [agentic-loop](../agentic-loop/) -- evaluate agent behavior
- [rag-pipeline](../rag-pipeline/) -- evaluate retrieval and generation quality
- [mcp-server-ts](../mcp-server-ts/) -- evaluate tool server responses

## Nests inside

- [monorepo](../monorepo/)
