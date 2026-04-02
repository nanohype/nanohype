# __PROJECT_NAME__

__DESCRIPTION__

A TypeScript evaluation harness for testing LLM outputs. Define eval suites in YAML, run them against an LLM provider, and get structured pass/fail results with composable assertions.

## Quick Start

```bash
# Run all eval suites
npm run eval

# Run with JSON output (for CI)
npm run eval:ci

# Run specific suites
npx tsx bin/run-evals.ts --suites "suites/my-suite.yaml"
```

## Writing Eval Suites

Create YAML files in the `suites/` directory:

```yaml
name: my-suite
description: Tests for my use case
cases:
  - name: test-case-name
    input: "Your prompt to the LLM"
    assertions:
      - type: contains
        value: "expected substring"
      - type: maxTokens
        value: 100
```

### Available Assertions

| Type | Value | Description |
|------|-------|-------------|
| `contains` | `string` | Output contains the substring |
| `notContains` | `string` | Output does not contain the substring |
| `matchesPattern` | `string` (regex) | Output matches the regular expression |
| `matchesJsonSchema` | `object` | Output is valid JSON matching the schema |
| `maxTokens` | `number` | Output is within the token limit |
| `semanticSimilarity` | `{ reference, threshold }` | Embedding-based similarity (requires integration) |

### Case Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique identifier for the case |
| `input` | yes | Prompt string or array of prompt strings |
| `expected` | no | Expected output (for reference) |
| `assertions` | yes | Array of assertions to evaluate |
| `tags` | no | Tags for filtering |
| `timeout` | no | Timeout in milliseconds (default: 30000) |

## Adding Custom Providers

The provider system is registry-based — add a new provider by creating a single file and importing it.

1. Create `src/providers/<name>.ts`:

```typescript
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

class MyProvider implements LlmProvider {
  async complete(messages: ChatMessage[]): Promise<string> {
    // Call your LLM API here
    return "response";
  }
}

registerProvider("my-provider", () => new MyProvider());
```

2. Import it in `src/providers/index.ts` so it registers on startup:

```typescript
import "./my-provider.js";
```

3. Use it via CLI (`--provider my-provider`) or set it as the default in the scaffold config.

## Adding Custom Assertions

Register new assertions in `src/assertions.ts`:

```typescript
import { ASSERTION_REGISTRY, type AssertionFn } from "./assertions.js";

// Add a custom assertion
ASSERTION_REGISTRY.myCustomCheck = (value: unknown): AssertionFn => {
  return (output: string) => {
    const pass = /* your logic */;
    return { pass, score: pass ? 1 : 0, message: "..." };
  };
};
```

## CLI Options

```
npx tsx bin/run-evals.ts [options]

--suites <glob>       Glob pattern for suite files (default: "suites/*.yaml")
--reporter <type>     Reporter: "console" or "json" (default: "console")
--provider <name>     LLM provider override (any registered provider name)
--concurrency <n>     Max parallel cases per suite (default: 5)
--output <path>       Output file for JSON reporter (stdout if omitted)
```

## CI Integration

The included GitHub Actions workflow runs eval suites on every pull request. Set the following secrets in your repository:

- `ANTHROPIC_API_KEY` — for the Anthropic provider
- `OPENAI_API_KEY` — for the OpenAI provider

Eval results are uploaded as build artifacts for review.

## Project Structure

```
src/
  runner.ts          # Core eval runner — orchestrates suite discovery and execution
  suite.ts           # EvalSuite class — loads YAML, runs cases, collects results
  case.ts            # EvalCase — input, assertions, metadata
  assertions.ts      # Assertion library and registry
  reporters/
    console.ts       # Color-coded terminal output
    json.ts          # Structured JSON for CI
  providers/
    types.ts         # LlmProvider interface and ChatMessage type
    registry.ts      # Registry — registerProvider / getProvider / listProviders
    anthropic.ts     # Anthropic Claude provider (self-registers)
    openai.ts        # OpenAI GPT provider (self-registers)
    index.ts         # Barrel — triggers registration, re-exports API
suites/
  example.yaml       # Example eval suite
bin/
  run-evals.ts       # CLI entrypoint
```
