# fine-tune-pipeline

TypeScript CLI for end-to-end LLM fine-tuning. Prepare datasets, submit training jobs, and evaluate fine-tuned models against their base counterparts.

## What you get

- CLI with `prepare`, `train`, and `eval` commands
- Dataset preparation: JSONL formatting, schema validation, configurable train/val/test splitting
- Training provider registry with OpenAI fine-tuning API built in
- Eval corpus of golden and adversarial cases, run against the fine-tuned model with the base model alongside for comparison
- Structured JSON logging and Zod-validated configuration

## Variables

| Variable       | Type   | Default                    | Description                                 |
| -------------- | ------ | -------------------------- | ------------------------------------------- |
| `ProjectName`  | string | `my-fine-tune`             | Kebab-case project name                     |
| `Description`  | string | `LLM fine-tuning pipeline` | Project description                         |
| `Provider`     | string | `openai`                   | Default training provider: openai or custom |
| `IncludeEval`  | bool   | `true`                     | Include the eval runner and its metrics     |
| `IncludeTests` | bool   | `true`                     | Include vitest test suite                   |

## Project layout

```text
<ProjectName>/
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
      registry.ts          # Provider registry (register/get/list)
      openai.ts            # OpenAI fine-tuning provider (self-registers)
      index.ts             # Barrel — triggers registration, re-exports API
    eval/
      cases.ts             # Corpus loader — refuses an empty or malformed corpus
      cases/               # One JSON case per file, golden and adversarial
      assertions.ts        # Assertion vocabulary the runner implements
      compare.ts           # Runs the corpus against base and fine-tuned models
      metrics.ts           # Accuracy, consistency, and quality metrics
  data/
    examples/
      .gitkeep             # Example data directory
```

## Pairs with

- [eval-harness](../eval-harness/) -- comprehensive evaluation beyond fine-tune comparison
- [agentic-loop](../agentic-loop/) -- build agents on top of fine-tuned models
- [rag-pipeline](../rag-pipeline/) -- combine fine-tuning with retrieval augmentation

## Nests inside

- [monorepo](../monorepo/)
