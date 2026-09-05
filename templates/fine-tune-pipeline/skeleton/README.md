# __PROJECT_NAME__

__DESCRIPTION__

A TypeScript CLI for end-to-end LLM fine-tuning. Prepare datasets, submit training jobs, and evaluate fine-tuned models against their base counterparts.

## Quick Start

```bash
# 1. Prepare your dataset (validate, split into train/val/test)
npm run prepare-data

# 2. Submit a fine-tuning job
npm run train

# 3. Check job status
npx tsx src/index.ts train:status <job-id>

# 4. Run the eval corpus against the fine-tuned model
FINE_TUNED_MODEL=ft:gpt-4o-mini:org::id npm run eval
```

## Dataset Format

Place your training data in JSONL format. Each line must be a JSON object with a `messages` array containing at least one `user` and one `assistant` message:

```jsonl
{"messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"What is 2+2?"},{"role":"assistant","content":"4"}]}
{"messages":[{"role":"user","content":"Translate hello to Spanish"},{"role":"assistant","content":"hola"}]}
```

The pipeline validates each example, reports errors with line numbers, and splits the valid examples into train/validation/test sets.

## Commands

| Command | Script | Description |
|---------|--------|-------------|
| `prepare` | `npm run prepare-data` | Validate and split dataset |
| `train` | `npm run train` | Submit fine-tuning job |
| `train:status <id>` | `npx tsx src/index.ts train:status <id>` | Check job status |
| `train:list` | `npx tsx src/index.ts train:list` | List recent jobs |
| `eval` | `npm run eval` | Run the eval corpus against the fine-tuned model |

## Eval Corpus

`src/eval/cases/` is where the project states what its tuning is for. Each file is one case: a prompt, and the assertions that must hold of the fine-tuned model's answer.

```json
{
  "name": "answers an incident question in the response form the tuning teaches",
  "kind": "golden",
  "input": "The payments service deploy is stuck ...",
  "assertions": [
    { "type": "matches_pattern", "value": "SEVERITY: (low|medium|high)", "why": "severity is a closed vocabulary in the training data" }
  ]
}
```

`kind` is `golden` for the behaviour the tuning exists to deliver, `adversarial` for input trying to make the tuned model do something else -- a prompt asking for a shape the training set never held, or content carrying text shaped like an instruction. Assertion types are `contains`, `not_contains` and `matches_pattern`; `why` carries the reason a check must hold, which is what a reader needs on an adversarial case where the assertion is the absence of something.

The shipped cases assert a support-triage response form. Replace them with the form your training data teaches -- the loader refuses a corpus that is empty, a case with no assertions, and an assertion type the runner does not implement, so a corpus that stops covering something says so instead of passing quietly.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_INPUT_PATH` | `./data/examples/raw.jsonl` | Path to raw training JSONL |
| `DATA_OUTPUT_DIR` | `./data/prepared` | Output directory for splits |
| `SPLIT_TRAIN_RATIO` | `0.8` | Training set ratio |
| `SPLIT_VAL_RATIO` | `0.1` | Validation set ratio |
| `SPLIT_TEST_RATIO` | `0.1` | Test set ratio |
| `BASE_MODEL` | `gpt-4o-mini-2024-07-18` | Model to fine-tune |
| `TRAINING_SUFFIX` | project name | Suffix for fine-tuned model |
| `FINE_TUNED_MODEL` | (none) | Fine-tuned model ID for eval |
| `OPENAI_API_KEY` | (required) | OpenAI API key |

## Adding Custom Providers

The training system is registry-based -- add a new provider by creating a single file and importing it.

1. Create `src/training/<name>.ts`:

```typescript
import type { TrainingProvider } from "./types.js";
import { registerProvider } from "./registry.js";

class MyProvider implements TrainingProvider {
  async uploadFile(filePath: string): Promise<string> { /* ... */ }
  async createJob(config) { /* ... */ }
  async getJobStatus(jobId: string) { /* ... */ }
  async cancelJob(jobId: string) { /* ... */ }
  async listJobs(limit?: number) { /* ... */ }
  async complete(model: string, prompt: string) { /* ... */ }
}

registerProvider("my-provider", () => new MyProvider());
```

2. Import it in `src/training/index.ts`:

```typescript
import "./my-provider.js";
```

## Architecture

The pipeline is organized around three CLI commands that form an end-to-end fine-tuning workflow:

- **Dataset pipeline** (`prepare`) -- Loads raw JSONL from `DATA_INPUT_PATH`, validates each example against the chat-completion message schema (system/user/assistant roles, non-empty content), reports per-line errors, shuffles valid examples, and splits them into train/validation/test sets at configurable ratios. Output files land in `DATA_OUTPUT_DIR`.
- **Training provider registry** (`train`, `train:status`, `train:list`) -- A self-registering registry pattern where each provider (e.g., OpenAI) implements `TrainingProvider` (upload, create job, status, cancel, list, complete). The CLI resolves the active provider from `TRAINING_PROVIDER`, uploads the prepared dataset, and submits a fine-tuning job. Status and listing commands poll the provider API.
- **Eval corpus** (`eval`) -- Loads the cases in `src/eval/cases/`, sends each one to both the base model and the fine-tuned model, checks the case's assertions against the fine-tuned output, and computes side-by-side metrics: exact match rate, token overlap score, and length ratio. Results print per case, then as an aggregate summary, with the outputs themselves at `LOG_LEVEL=debug`. The command exits non-zero when a case fails.

### Design Decisions

- **CLI-first** -- no HTTP server, no background workers. Each command runs to completion and exits, making it easy to compose in CI or cron.
- **Registry pattern** -- adding a new training provider is a single file that self-registers on import. No central switch statement to maintain.
- **Zod config validation** -- `loadConfig()` parses all environment variables against a typed schema at startup. Missing or invalid values halt immediately with specific error messages.
- **Graceful shutdown** -- SIGTERM/SIGINT handlers log and exit cleanly, preventing orphaned processes in containerized environments.
- **The eval refuses an empty corpus** -- `loadCases` throws rather than returning an empty list, and the corpus is read before any provider client is built. A run that found nothing to run would otherwise report exactly what a run of the full corpus that passed reports, and would report it as a missing credential rather than as an empty corpus.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Configure production `OPENAI_API_KEY` (or your provider's key)
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Validate dataset quality before submitting training jobs
- [ ] Monitor fine-tuning job costs in the provider dashboard
- [ ] Store training data and model IDs in version control or a metadata store
- [ ] Set up alerting on training job failures
- [ ] Pin `BASE_MODEL` to a specific version to ensure reproducibility

## Project Structure

```
src/
  index.ts               # CLI entry with prepare/train/eval commands
  config.ts              # Zod-validated configuration from env vars
  logger.ts              # Structured JSON logger
  bootstrap.ts           # Unresolved placeholder guard
  dataset/
    prepare.ts           # JSONL formatting and file writing
    validate.ts          # Schema validation for training examples
    split.ts             # Train/val/test splitting with shuffling
    types.ts             # Dataset type definitions
  training/
    types.ts             # TrainingProvider interface
    registry.ts          # Registry -- registerProvider / getProvider / listProviders
    openai.ts            # OpenAI fine-tuning provider (self-registers)
    index.ts             # Barrel -- triggers registration, re-exports API
  eval/
    cases.ts             # Corpus loader -- refuses an empty or malformed corpus
    cases/               # One JSON case per file, golden and adversarial
    assertions.ts        # Assertion vocabulary the runner implements
    compare.ts           # Runs the corpus against base and fine-tuned models
    metrics.ts           # Accuracy, consistency, and quality metrics
data/
  examples/              # Place raw training JSONL here
```
