# __PROJECT_NAME__

__DESCRIPTION__

A versioned prompt management system using YAML files with structured frontmatter. Each prompt is a standalone YAML file containing metadata (model, temperature, version, tags) and a template body with runtime variables.

## Important: Two Layers of Templating

This project involves two distinct placeholder systems that operate at different times:

**Scaffold placeholders** (`__PROJECT_NAME__`, `__DESCRIPTION__`) are replaced once during project generation by the nanohype scaffolding tool. They produce the initial project files and do not exist at runtime.

**Prompt variables** (`{{variable}}`) live inside prompt YAML files and are replaced at runtime when a prompt is rendered. They are part of the prompt template system and persist in the codebase as reusable placeholders.

These two systems never interact. Scaffold placeholders are gone after project setup; prompt variables remain and are resolved each time a prompt is used.

## Directory Structure

```
__PROJECT_NAME__/
  prompts/
    system/          # System prompts (persona, instructions)
      example.yaml
    user/            # User-facing prompt templates
      example.yaml
  schema/
    prompt.schema.json   # JSON Schema for prompt frontmatter validation
  sdk/                   # TypeScript SDK (optional)
    src/
      index.ts           # Prompt loading, rendering, validation functions
      types.ts           # TypeScript type definitions
    package.json
    tsconfig.json
  tests/
    validate.ts          # Validation script for all prompt files
  package.json
  README.md
```

## Prompt Format

Each prompt is a YAML file with frontmatter metadata and a template body:

```yaml
---
name: summarize-document
version: "1.2.0"
model: claude-sonnet-4-5-20250514
temperature: 0.3
tags: [summarization, documents]
variables:
  - name: document
    description: The document text to summarize
    required: true
  - name: max_length
    description: Maximum summary length in words
    default: "200"
---
Summarize the following document in no more than {{max_length}} words.
Focus on key findings, decisions, and action items.

Document:
{{document}}
```

### Frontmatter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Kebab-case prompt identifier |
| `version` | string | yes | Semantic version (e.g. `"1.0.0"`) |
| `model` | string | no | Target model identifier |
| `temperature` | number | no | Sampling temperature (0-2) |
| `max_tokens` | integer | no | Maximum response tokens |
| `tags` | string[] | no | Categorization tags |
| `variables` | Variable[] | no | Template variables for `{{var}}` substitution |

### Variable Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Variable name, used in `{{name}}` placeholders |
| `description` | string | yes | What this variable represents |
| `required` | boolean | no | Whether the variable must be provided |
| `default` | string | no | Default value if not provided |

## Writing Prompts

1. Create a new `.yaml` file under `prompts/system/` or `prompts/user/`
2. Add frontmatter between `---` delimiters with at least `name` and `version`
3. Write the prompt body below the closing `---`
4. Use `{{variable_name}}` for values that change at runtime
5. Declare all variables in the frontmatter `variables` array
6. Run `npm run validate` to check your prompt against the schema

### Conventions

- **System prompts** go in `prompts/system/` — these define AI persona, behavior rules, and context
- **User prompts** go in `prompts/user/` — these are task-specific templates with input variables
- Use kebab-case for prompt `name` fields
- Version prompts with semver: bump patch for wording tweaks, minor for variable changes, major for purpose changes

## Using the SDK

The TypeScript SDK provides functions for loading, rendering, and validating prompts programmatically.

### Installation

```bash
cd sdk && npm install && npm run build
```

### API

```typescript
import {
  loadPrompt,
  loadPrompts,
  renderPrompt,
  getPromptByName,
  validatePrompt,
} from "./__PROJECT_NAME__-sdk";

// Load a single prompt
const prompt = await loadPrompt("prompts/user/example.yaml");

// Load all prompts from a directory
const allPrompts = await loadPrompts("prompts");

// Find a prompt by name
const summarizer = await getPromptByName("prompts", "summarize-document");

// Render with variables — substitutes {{variable}} placeholders
const rendered = renderPrompt(summarizer, {
  document: "The quarterly report shows...",
  max_length: "150",
});

console.log(rendered.content);
// => "Summarize the following document in no more than 150 words..."
```

## Validation

Run the validation suite to check all prompt files against the JSON Schema:

```bash
npm run validate
```

This checks every `.yaml` file under `prompts/` for:
- Valid YAML frontmatter with `---` delimiters
- Required fields (`name`, `version`) present and correctly typed
- Semver-compliant version strings
- No circular variable default references

## Versioning Strategy

Each prompt carries its own `version` field using semantic versioning:

- **Patch** (`1.0.0` -> `1.0.1`): Wording improvements, typo fixes, no behavior change
- **Minor** (`1.0.0` -> `1.1.0`): New variables added, optional sections changed, backward-compatible
- **Major** (`1.0.0` -> `2.0.0`): Purpose changed, required variables added/removed, breaking change

Version the prompts independently — a change to one prompt does not require bumping others. Use git tags or a changelog if you need release-level tracking across the library.
