# prompt-library

Versioned prompt management system using YAML files with structured frontmatter. Includes an optional TypeScript SDK for loading, validating, and rendering prompts programmatically.

## What you get

- YAML prompt files with frontmatter for metadata (version, model, temperature, variables)
- JSON Schema for validating prompt file structure
- Optional TypeScript SDK for loading, rendering, and validating prompts
- Optional validation test suite that checks all prompts against the schema
- Directory structure for organizing system and user prompts

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | `prompts` | Kebab-case project name |
| `Description` | string | `A versioned prompt library` | Project description |
| `IncludeSdk` | bool | `true` | Include TypeScript SDK |
| `IncludeTests` | bool | `true` | Include validation tests |

## Project layout

```text
<ProjectName>/
  prompts/
    system/
      example.yaml         # System prompt with frontmatter
    user/
      example.yaml         # User prompt template with variables
  schema/
    prompt.schema.json     # JSON Schema for prompt validation
  sdk/                     # (optional) TypeScript SDK
    src/
      index.ts             # Loader, renderer, validator
      types.ts             # TypeScript interfaces
  tests/                   # (optional) Validation suite
    validate.ts            # Schema + structural validation
```

## Pairs with

- [agentic-loop](../agentic-loop/) -- load prompts for agent system messages
- [eval-harness](../eval-harness/) -- test prompt variations systematically

## Nests inside

- [monorepo](../monorepo/)
