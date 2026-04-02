# __PROJECT_NAME__

__DESCRIPTION__

Input/output safety filters for AI systems with pluggable filter pipeline.

## Getting Started

```bash
npm install
npm run build
```

## Usage

### Basic setup

```ts
import { createGuardrail } from "__PROJECT_NAME__";

const guard = createGuardrail({
  maxTokens: 2048,
  blockedKeywords: ["forbidden"],
});

// Filter user input before sending to LLM
const inputResult = guard("User message here", "input");
if (!inputResult.allowed) {
  console.log("Blocked:", inputResult.violations);
}

// Filter LLM output before sending to user
const outputResult = guard("LLM response here", "output");
console.log(outputResult.filtered); // PII-redacted output
```

### Selective filters

```ts
import { createGuardrail } from "__PROJECT_NAME__";

// Run only specific filters
const guard = createGuardrail({
  filters: ["prompt-injection", "token-limit"],
  maxTokens: 4096,
});
```

### Non-short-circuit mode

```ts
import { createGuardrail } from "__PROJECT_NAME__";

// Collect violations from ALL filters instead of stopping at first block
const guard = createGuardrail({ shortCircuit: false });
const result = guard(userInput, "input");
// result.violations contains every violation across all filters
```

## Built-in Filters

| Filter | Direction | Behavior |
|--------|-----------|----------|
| `prompt-injection` | input only | Detects override attempts, system prompt extraction, jailbreaks |
| `pii` | both | Redacts emails, phone numbers, SSNs, credit cards |
| `content-policy` | both | Blocks configurable denied keywords |
| `token-limit` | both | Blocks content exceeding max token count |

## Custom Filters

```ts
import { registerFilter } from "__PROJECT_NAME__/filters";
import type { Filter } from "__PROJECT_NAME__/filters";

const myFilter: Filter = {
  name: "custom",
  filter(input, direction) {
    // Inspect content, return result
    return { allowed: true, filtered: input, violations: [] };
  },
};

registerFilter(myFilter);
```

## Project Structure

```
src/
  guardrails/
    index.ts              # Main entry point — createGuardrail(config)
    types.ts              # FilterResult, GuardrailConfig, Violation
    pipeline.ts           # Filter pipeline — chains multiple filters
    filters/
      types.ts            # Filter interface
      registry.ts         # Filter registry
      prompt-injection.ts # Prompt injection detection
      pii.ts              # PII detection and redaction
      content-policy.ts   # Content policy enforcement
      token-limit.ts      # Token/length limit guard
      index.ts            # Barrel import + re-exports
      __tests__/
        pipeline.test.ts
        prompt-injection.test.ts
        pii.test.ts
  logger.ts               # Structured JSON logger
```
