# Template Authoring Guide

A practical walkthrough for creating a new nanohype template, from empty directory to validated, catalog-ready artifact.

---

## 1. Prerequisites

Before you begin:

- **Read the [Template Contract Specification](spec/template-contract.md).** This guide walks you through the contract; the spec is the authoritative reference.
- **Install dependencies** for validation:

```bash
cd <catalog-root>
npm install
```

This pulls in `ajv-cli` and `ajv-formats`, which power schema validation via `npm run validate:schema`.

- **A text editor** and basic familiarity with YAML.

---

## 2. Quick Start

Every template lives in `templates/<name>/` and contains three things:

```text
templates/
  my-template/
    template.yaml     # manifest (required)
    skeleton/          # output file tree (required, may be empty)
    README.md          # documentation (recommended)
```

Create the directory and files:

```bash
mkdir -p templates/my-template/skeleton
touch templates/my-template/template.yaml
touch templates/my-template/README.md
```

The directory name (`my-template`) must be kebab-case and must exactly match the `name` field in `template.yaml`.

---

## 3. Writing template.yaml

The manifest is the heart of the template. Build it up one section at a time.

### 3.1 Start with the Header

Every manifest begins with the API version:

```yaml
apiVersion: nanohype/v1
```

This is always `nanohype/v1`. Consumers reject manifests with any other value.

### 3.2 Metadata

```yaml
name: my-template
displayName: "My Template"
description: >
  A one-to-three sentence description of what this template scaffolds
  and why someone would reach for it.
version: "0.1.0"
license: Apache-2.0
tags: [python, cli, async]
```

Field rules:

- **`name`** -- Kebab-case, matches the directory name. Pattern: `^[a-z][a-z0-9-]*$`.
- **`displayName`** -- Human-readable. Used in UIs and listings.
- **`description`** -- Multi-line is fine (use YAML `>` or `|` folding). Explain what the scaffolded output looks like.
- **`version`** -- Valid semver. Bump this when the template's output changes meaningfully.
- **`license`** -- SPDX identifier for the _scaffolded output_, not the template itself. Optional.
- **`tags`** -- At least one. Lowercase, kebab-case. Used for search and filtering.

### 3.3 Variables

Variables are the inputs users provide when scaffolding. Declare them as an ordered array:

```yaml
variables:
  - name: ProjectName
    type: string
    placeholder: "__PROJECT_NAME__"
    description: "Name of the project"
    prompt: "Project name"
    default: "myapp"
    required: true
    validation:
      pattern: "^[a-z][a-z0-9-]*$"
      message: "Must be lowercase kebab-case"
```

Every variable needs four fields: `name`, `type`, `placeholder`, and `description`. Everything else is optional (but `prompt`, `default`, and `validation` are strongly recommended).

**Variable names are PascalCase.** Pattern: `^[A-Z][a-zA-Z0-9]*$`.

### 3.4 Variable Types

There are four types. Here is a complete example of each.

**string** -- Free-form text input:

```yaml
- name: GoModule
  type: string
  placeholder: "__GO_MODULE__"
  description: "Full Go module path"
  default: "github.com/example/${ProjectName}"
  required: true
  validation:
    pattern: "^[a-z][a-z0-9./-]*$"
    message: "Must be a valid Go module path"
```

**bool** -- True or false. Primarily used with conditionals to include or exclude files:

```yaml
- name: IncludeDocker
  type: bool
  placeholder: "__INCLUDE_DOCKER__"
  description: "Include Dockerfile and docker-compose.yaml"
  default: false
```

**enum** -- One value from a fixed list. Requires the `options` field:

```yaml
- name: LogLevel
  type: enum
  placeholder: "__LOG_LEVEL__"
  description: "Default log level"
  default: "info"
  options: ["debug", "info", "warn", "error"]
```

**int** -- An integer value:

```yaml
- name: HttpPort
  type: int
  placeholder: "__HTTP_PORT__"
  description: "Default HTTP port"
  default: 8080
```

### 3.5 Defaults and Cross-References

Defaults are optional but improve the user experience. A default must match the variable's type (a string for `string`/`enum`, a boolean for `bool`, an integer for `int`).

Defaults can reference other variables using `${VariableName}` syntax:

```yaml
- name: ProjectName
  type: string
  placeholder: "__PROJECT_NAME__"
  description: "Project name"
  default: "myapp"

- name: BinaryName
  type: string
  placeholder: "__BINARY_NAME__"
  description: "Output binary name"
  default: "${ProjectName}"
```

Cross-references are resolved after the user provides all explicit values. Circular references are invalid -- consumers will reject them.

**Variable ordering matters.** Variables are presented to users in array order. Put foundational variables (like project name) first so that later variables can reference them in defaults.

### 3.6 Validation Patterns

The `validation.pattern` field takes an ECMAScript regex. Consumers treat it as anchored (the entire value must match). Always pair it with a `message`:

```yaml
validation:
  pattern: "^[a-z][a-z0-9-]*$"
  message: "Must be lowercase kebab-case starting with a letter"
```

Validation runs after defaults are resolved, before placeholder substitution. It applies to `string` and `int` types. There is no validation for `bool` (it is inherently constrained) and `enum` values are validated against `options` automatically.

---

## 4. Building the Skeleton

The `skeleton/` directory contains the files and directories that will appear in the scaffolded output, exactly as they should look -- but with placeholder tokens where variable values belong.

### 4.1 Placeholder Convention

Placeholders are literal strings declared in each variable's `placeholder` field. There is no mandated syntax. The convention in this catalog is double-underscore wrapping: `__LIKE_THIS__`.

In file content:

```text
# skeleton/go.mod
module __GO_MODULE__

go 1.22
```

In file and directory names:

```text
skeleton/
  cmd/
    __PROJECT_NAME__/
      main.go
```

When a user scaffolds with `ProjectName = "hype"`, the output is `cmd/hype/main.go`.

### 4.2 Substitution Rules

- Find-and-replace is textual and non-recursive. A resolved value that contains another placeholder string will not trigger a second pass.
- All occurrences of a placeholder are replaced. There is no escape mechanism.
- Placeholders must be unique across all variables. No placeholder may be a substring of another placeholder in the same template.

### 4.3 Skeleton Quality

Keep skeleton files as close to real, runnable code as possible. After scaffolding with sensible defaults, the output should:

- Compile or pass a syntax check
- Have valid configuration files
- Include reasonable `.gitignore`, `Makefile`, or equivalent for the ecosystem
- Work as a starting point someone can `git init` and build on immediately

Avoid leaving TODO comments where real code should be. If a section needs user customization, put a working default in place and note it in the template README.

---

## 5. Conditionals

Conditionals let you include or exclude files based on a `bool` variable.

```yaml
variables:
  - name: IncludeDocker
    type: bool
    placeholder: "__INCLUDE_DOCKER__"
    description: "Include Docker configuration"
    default: false

conditionals:
  - path: "Dockerfile"
    when: IncludeDocker
  - path: "docker-compose.yaml"
    when: IncludeDocker
  - path: ".dockerignore"
    when: IncludeDocker
```

Rules:

- `path` is relative to `skeleton/`. It can be a file or a directory (the entire subtree is included or excluded).
- `when` must reference a `bool`-typed variable.
- Files not mentioned in any conditional are always included.
- A file must not appear in more than one conditional. If you need complex logic, introduce an additional `bool` variable.
- Placeholder substitution still applies to conditionally-included files.

---

## 6. Hooks

Hooks are shell commands that run before or after skeleton expansion.

```yaml
hooks:
  pre: []
  post:
    - name: install-dependencies
      description: "Install Python dependencies"
      run: "pip install -r requirements.txt"
      workdir: "."
    - name: init-git
      description: "Initialize git repository"
      run: "git init && git add -A"
      workdir: "."
```

### 6.1 Lifecycle

```text
1. Validate manifest
2. Collect variable values
3. Validate variable values
4. Check prerequisites
5. Run pre hooks (in order)
6. Copy skeleton with substitution and conditional filtering
7. Run post hooks (in order)
```

### 6.2 Advisory Execution Model

Hooks are advisory, not mandatory. Consumers will:

- Display each hook's name, description, and command to the user
- Require explicit confirmation before running
- Allow users to skip all hooks (e.g. `--no-hooks`)

Design your template so it produces correct output even if hooks are skipped. Hooks should handle convenience setup (installing dependencies, formatting code, initializing git) rather than structural correctness.

### 6.3 Environment

Hooks receive `NANOHYPE_TEMPLATE_NAME` and `NANOHYPE_OUTPUT_DIR` as environment variables. Resolved template variables may be available as `NANOHYPE_VAR_<Name>` but this is not guaranteed -- do not depend on it without checking.

---

## 7. Composition and Prerequisites

### 7.1 Composition

Composition is advisory metadata that helps users discover related templates.

```yaml
composition:
  pairsWith: [eval-harness, docker-deploy]
  nestsInside: [monorepo]
```

- **`pairsWith`** -- Templates designed to work alongside this one.
- **`nestsInside`** -- Templates within whose output this template can be scaffolded as a subdirectory.

These are suggestions, not enforcement. Consumers may surface them after scaffolding. Referenced templates do not need to exist in the catalog yet.

### 7.2 Prerequisites

Prerequisites declare external tools the scaffolded output or hooks depend on.

```yaml
prerequisites:
  - name: go
    version: ">=1.22"
    purpose: "Go compilation and module management"
    optional: false
  - name: goreleaser
    purpose: "Automated release builds (only if release config is included)"
    optional: true
```

- Required prerequisites (`optional: false`, the default) cause consumers to warn and potentially block.
- Optional prerequisites cause a warning but never block.
- Always include `purpose` so users understand the impact of a missing tool.
- `version` is a semver range. Version checking is best-effort on the consumer side.

---

## 8. Validating Your Template

### 8.1 Schema Validation

Run the JSON Schema validator against all templates in the catalog:

```bash
npm run validate:schema
```

This uses `ajv-cli` to validate every `templates/*/template.yaml` against `schemas/template.schema.json`.

### 8.2 Structural Validation

Run the full validation script, which checks both schema conformance and structural invariants:

```bash
./scripts/validate.sh
```

Or validate a single template:

```bash
./scripts/validate.sh templates/my-template
```

The structural checks enforce rules that JSON Schema alone cannot express:

- Every `conditionals[].when` references a `bool`-typed variable
- All placeholders are unique and no placeholder is a substring of another
- Every `enum` variable has a non-empty `options` array
- Default values match their variable's type
- Default cross-references (`${VariableName}`) do not form cycles
- The directory name matches the `name` field

### 8.3 Manual Smoke Test

Before submitting, mentally walk through a scaffolding run:

1. Pick values for every variable (or use defaults).
2. Check that every placeholder in the skeleton would be replaced.
3. Verify conditionals would include/exclude the right files.
4. Confirm the resulting file tree makes sense as a real project.

---

## 9. Template README

Every template should include a `README.md` alongside `template.yaml`. Sections, in order:

- **What you get** -- a summary of the scaffolded file tree and what each piece does.
- **Variables** -- a table listing each variable, its type, default, and what it controls. This duplicates information from `template.yaml` in a human-scannable format.
- **Project layout** -- the directory tree with explanations of each component.
- **Pairs with** -- links to complementary templates (matches `composition.pairsWith`).
- **Nests inside** -- where this template can be scaffolded within (matches `composition.nestsInside`).

The README is for humans browsing the catalog. The manifest is for tools.

---

## 10. Common Patterns

### Use descriptive placeholder names

Prefer `__GO_MODULE__` over `__VAR2__`. Placeholders appear in skeleton source code -- someone reading the skeleton should understand what each placeholder means without cross-referencing the manifest.

### Put the most important variable first

The `variables` array is ordered. Lead with the project name or primary identifier. Follow with values that other defaults depend on. Put optional/niche variables last.

### One bool per conditional group

If you have a group of related files that should be included or excluded together (e.g. Docker files, CI configuration, release automation), use a single `bool` variable and multiple conditional entries pointing to it.

### Keep skeletons minimal but complete

Include enough files to produce something that works out of the box. Do not include every possible configuration file an advanced user might want. The template is a starting point, not a comprehensive scaffold.

### Use cross-references to reduce user input

If the binary name is usually the same as the project name, default it to `${ProjectName}`. Users who want something different can override it; everyone else provides one fewer value.

### Make hooks idempotent

Since hooks may be re-run (or skipped and run manually later), write them so they are safe to execute more than once. `go mod tidy` and `npm install` are naturally idempotent. `git init` in an existing repo is a no-op. Prefer commands with this property.

### Test with realistic values

When validating your template, use values that look like a real project -- not `test` and `foo`. Real values surface issues with placeholder collisions, path lengths, and code correctness that synthetic values miss.

### Version intentionally

Start at `0.1.0`. Bump the patch version for skeleton fixes, the minor version for new variables or structural changes, and the major version for breaking changes to the variable interface that would change existing users' workflows.

### Provider registry pattern

When a template has a pluggable seam (LLM provider, database driver, auth provider, etc.), use the registry pattern:

1. **Define an interface** -- `types.ts` (TypeScript) or a Protocol class (Python)
2. **Create a registry** -- `registry.ts` with `registerProvider()`, `getProvider()`, `listProviders()`
3. **Self-registering implementations** -- each provider file imports `registerProvider` and calls it at the bottom
4. **Barrel import** -- `index.ts` imports all provider files to trigger registration, then re-exports the registry API

Use `type: string` (not `enum`) for the variable so users can add custom providers without modifying `template.yaml`. The default value names a built-in provider:

```yaml
variables:
  - name: LlmProvider
    type: string
    placeholder: "__LLM_PROVIDER__"
    description: "LLM provider (built-in: anthropic, openai — or any registered custom provider)"
    default: "anthropic"
```

Adding a new provider to a scaffolded project is then: create a file, implement the interface, self-register, add one import line.

### Module templates

Templates prefixed with `module-` are composable modules designed to be layered into other projects rather than used standalone. They follow the same `template.yaml` contract but their skeletons produce a subdirectory (e.g., `src/auth/`, `src/db/`) rather than a full project.

Module templates should:

- Use the same registry pattern for their pluggable seams
- Export a clean public API via a barrel `index.ts`
- Include a standalone `package.json` so they can be validated independently
- Reference the templates they complement via `composition.pairsWith`
