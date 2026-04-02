# Template Contract Specification

**Schema version:** `nanohype/v1`
**Status:** Normative
**License:** Apache-2.0

---

## 1. Overview

This document defines the **template contract** — the interface between a nanohype template and any tool that consumes it. A template is a self-describing directory containing a YAML manifest (`template.yaml`) and a file tree (`skeleton/`) with placeholder tokens. Any scaffolding tool, code generator, or IDE integration that reads the manifest and performs substitution on the skeleton is a **consumer**.

The contract is intentionally tool-agnostic. It specifies _what_ a template declares, not _how_ a consumer renders it. A consumer that faithfully implements this spec will produce correct output from any conforming template.

**Audience:** Template authors, consumer (scaffolding tool) implementors, catalog maintainers.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **Template** | A named, versioned unit in the catalog. Contains a manifest and a skeleton. |
| **Manifest** | The `template.yaml` file. Declares metadata, variables, conditionals, hooks, composition hints, and prerequisites. |
| **Skeleton** | The `skeleton/` directory. Contains files and directories exactly as they should appear in the generated output, with placeholder tokens standing in for variable values. |
| **Placeholder** | A literal string (e.g. `__PROJECT_NAME__`) that appears in skeleton file content or file/directory names. Each variable declares its own placeholder. Consumers perform textual find-and-replace — no template engine syntax is imposed. |
| **Contract** | This specification. The set of guarantees a template makes to consumers and vice versa. |
| **Consumer** | Any tool that reads a template manifest, collects variable values from the user, and produces output by copying the skeleton with placeholders resolved. |
| **Catalog** | The collection of all templates in a nanohype repository. |

---

## 3. File Structure

A template is a directory under `templates/` in the catalog root:

```text
templates/
  <name>/
    template.yaml          # manifest (REQUIRED)
    skeleton/              # output file tree (REQUIRED, may be empty)
      go.mod
      cmd/
        __PROJECT_NAME__/
          main.go
    README.md              # human-readable docs for this template (RECOMMENDED)
```

**Rules:**

- `<name>` MUST match the `name` field in the manifest exactly.
- `template.yaml` MUST be present and MUST conform to this spec.
- `skeleton/` MUST be present. It MAY be empty (e.g. for composition-only templates).
- Skeleton paths are relative to `skeleton/`. A file at `skeleton/cmd/main.go` produces `cmd/main.go` in the output.
- Placeholder tokens MAY appear in file content, file names, and directory names.
- There are no reserved file names inside `skeleton/` — the template owns the entire tree.

---

## 4. Schema Reference

The manifest is a YAML document. The root object has the following fields:

### 4.1 Top-Level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `apiVersion` | string | **yes** | Schema version. MUST be `nanohype/v1`. |
| `name` | string | **yes** | Template identifier. Kebab-case (`^[a-z][a-z0-9-]*$`). Unique within the catalog. |
| `displayName` | string | **yes** | Human-readable name. Used in UIs and listings. |
| `description` | string | **yes** | Multi-line description of what the template produces. |
| `version` | string | **yes** | Template version. MUST be valid semver (e.g. `"0.1.0"`). |
| `license` | string | no | SPDX license identifier for the _scaffolded output_ (not the template itself). |
| `tags` | array of strings | **yes** | Lowercase, searchable tags. Minimum one tag. |
| `variables` | array of [Variable](#42-variable-object) | **yes** | Ordered list of template variables. MAY be empty (`[]`). |
| `conditionals` | array of [Conditional](#43-conditional-object) | no | File inclusion/exclusion rules. |
| `hooks` | [Hooks](#44-hooks-object) | no | Lifecycle commands. |
| `composition` | [Composition](#45-composition-object) | no | Advisory relationships to other templates. |
| `prerequisites` | array of [Prerequisite](#46-prerequisite-object) | no | External tool requirements. |

### 4.2 Variable Object

Each entry in `variables` describes one user-supplied value and how it maps into the skeleton.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | **yes** | Variable identifier. PascalCase (`^[A-Z][a-zA-Z0-9]*$`). Unique within the template. |
| `type` | string | **yes** | One of: `string`, `bool`, `enum`, `int`. |
| `placeholder` | string | **yes** | The literal token to find-and-replace in skeleton files and paths. |
| `description` | string | **yes** | What this variable controls. |
| `prompt` | string | no | Human-friendly prompt text. Consumers MAY use this when interactively collecting values. Defaults to `description` if absent. |
| `default` | (varies) | no | Default value. Type must match `type`. See [5.3 Defaults](#53-defaults). |
| `required` | boolean | no | Whether the user must supply a value. Defaults to `false`. When `true` and no `default` is set, the consumer MUST obtain a value before proceeding. |
| `validation` | [Validation](#421-validation-object) | no | Constraints on the value. |
| `options` | array of strings | conditional | **Required** when `type` is `enum`. The allowed values. MUST NOT be present when `type` is not `enum`. |

#### 4.2.1 Validation Object

| Field | Type | Required | Description |
|---|---|---|---|
| `pattern` | string | no | ECMAScript regular expression. Applicable to `string` and `int` types. The full value must match (anchored). |
| `message` | string | no | Human-readable error message when validation fails. |

### 4.3 Conditional Object

Each entry controls whether a skeleton path is included in the output.

| Field | Type | Required | Description |
|---|---|---|---|
| `path` | string | **yes** | Relative path from `skeleton/` root. May refer to a file or a directory. |
| `when` | string | **yes** | Name of a variable. MUST reference a variable of type `bool`. |

### 4.4 Hooks Object

| Field | Type | Required | Description |
|---|---|---|---|
| `pre` | array of [Hook](#441-hook-object) | no | Commands run before skeleton expansion. |
| `post` | array of [Hook](#441-hook-object) | no | Commands run after skeleton expansion. |

#### 4.4.1 Hook Object

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | **yes** | Identifier for the hook (for logging and user confirmation). |
| `description` | string | **yes** | What this hook does. |
| `run` | string | **yes** | Shell command to execute. Interpreted by the system shell (`sh -c`). |
| `workdir` | string | no | Working directory, relative to the output root. Defaults to `"."`. |

### 4.5 Composition Object

All fields are advisory. Consumers MAY surface this information to users but MUST NOT enforce it.

| Field | Type | Required | Description |
|---|---|---|---|
| `pairsWith` | array of strings | no | Template `name` values that complement this template. |
| `nestsInside` | array of strings | no | Template `name` values that this template can be scaffolded within. |

### 4.6 Prerequisite Object

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | **yes** | Binary or tool name (as it would appear on `$PATH`). |
| `version` | string | no | Semver range (e.g. `">=1.22"`, `"^3.0.0"`). |
| `purpose` | string | **yes** | Why this prerequisite is needed. |
| `optional` | boolean | no | If `true`, the consumer SHOULD warn but MUST NOT block. Defaults to `false`. |

---

## 5. Variable System

### 5.1 Types

| Type | YAML representation | Placeholder substitution |
|---|---|---|
| `string` | scalar string | Literal text replacement. |
| `bool` | `true` / `false` | Replaced with the string `"true"` or `"false"`. Primary use is in conditionals; placeholder substitution in file content is permitted but uncommon. |
| `int` | integer scalar | Replaced with the decimal string representation. |
| `enum` | scalar string (one of `options`) | Literal text replacement, same as `string`. |

### 5.2 Placeholders

A placeholder is an arbitrary literal string declared per-variable. There is no mandated syntax — `__FOO__`, `{{FOO}}`, `%%FOO%%`, and `REPLACE_ME` are all valid placeholders.

**Substitution rules:**

1. Consumers MUST perform textual find-and-replace of each variable's `placeholder` with the resolved value.
2. Substitution applies to **file content** and **file/directory names** within the skeleton.
3. Substitution is not recursive — a resolved value that happens to contain another placeholder string MUST NOT trigger a second pass.
4. Placeholder strings MUST be unique across all variables in a template. No placeholder may be a substring of another placeholder in the same template.
5. All occurrences of a placeholder are replaced. There is no escape mechanism.

**Filename substitution example:**

```text
skeleton/cmd/__PROJECT_NAME__/main.go
```

With `ProjectName` = `"myapp"` and `placeholder` = `"__PROJECT_NAME__"`, the output path is:

```text
cmd/myapp/main.go
```

### 5.3 Defaults

- A `default` value MUST match the variable's declared `type`.
- Defaults MAY reference other variables using the syntax `${VariableName}`. Consumers MUST resolve references after all explicit user values are collected. Circular references are invalid; consumers MUST reject them.
- If `required` is `true` and no `default` is provided, the consumer MUST prompt the user or fail — it MUST NOT silently use an empty value.
- If `required` is `false` (or absent) and no `default` is provided and the user supplies no value, the consumer MUST substitute an empty string for `string` and `enum` types, `false` for `bool`, and `0` for `int`.

### 5.4 Validation

- The `validation.pattern` field is an ECMAScript regular expression. Consumers MUST treat it as anchored (the entire value must match, equivalent to wrapping in `^(?:...)$` if not already anchored).
- Validation is checked after defaults are resolved and before substitution.
- If validation fails, the consumer MUST report `validation.message` (if present) or a generic error including the pattern.
- Consumers MUST validate the manifest itself against the nanohype JSON Schema using ajv (or any compliant JSON Schema validator). Variable-level `validation` is a separate, runtime concern applied to user-supplied values.

### 5.5 Variable Ordering

The `variables` array is ordered. Consumers that collect values interactively SHOULD present them in array order. This allows template authors to control the flow — e.g. asking for a project name before asking for a module path that defaults to `${ProjectName}`.

---

## 6. Conditionals

Conditionals control which skeleton files appear in the output.

### 6.1 Semantics

- Each conditional references a `bool`-typed variable by `name` via the `when` field.
- When the referenced variable resolves to `true`, the file or directory at `path` is **included**.
- When it resolves to `false`, the file or directory at `path` is **excluded** — it MUST NOT appear in the output.
- If `path` refers to a directory, the entire subtree is included or excluded.

### 6.2 Rules

- `path` is relative to `skeleton/`. It MUST NOT start with `/` or `..`.
- `when` MUST reference a variable of type `bool`. Consumers MUST reject manifests where `when` references a non-bool variable.
- Skeleton files not mentioned in any conditional are always included.
- A file MUST NOT appear in more than one conditional entry. If complex logic is needed, introduce an additional bool variable.
- Placeholder substitution in file content and names still applies to conditionally-included files.

### 6.3 Example

```yaml
variables:
  - name: IncludeRelease
    type: bool
    placeholder: "__INCLUDE_RELEASE__"
    description: "Include GoReleaser configuration"
    default: false

conditionals:
  - path: ".goreleaser.yaml"
    when: IncludeRelease
  - path: "scripts/release.sh"
    when: IncludeRelease
```

When `IncludeRelease` is `false`, neither `.goreleaser.yaml` nor `scripts/release.sh` appears in the output.

---

## 7. Hooks

Hooks are shell commands that run at defined points in the scaffolding lifecycle.

### 7.1 Lifecycle

```text
1. Validate manifest
2. Collect variable values
3. Validate variable values
4. Check prerequisites
5. Run pre hooks (in array order)
6. Copy skeleton with placeholder substitution and conditional filtering
7. Run post hooks (in array order)
```

### 7.2 Execution

- Hooks run via the system shell (`sh -c "<run>"`).
- `workdir` is resolved relative to the output directory root. For `pre` hooks, the output directory may not yet be fully populated.
- Hooks execute sequentially in array order within their phase (`pre` or `post`).
- If a hook exits with a non-zero status, the consumer SHOULD report the failure and MAY abort or continue at the user's discretion.

### 7.3 Security Model

Hooks are **advisory, not mandatory**. Consumers:

- MUST display each hook's `name`, `description`, and `run` command to the user before execution.
- SHOULD require explicit user confirmation before running any hook.
- MAY provide a `--no-hooks` flag or equivalent to skip all hooks.
- MUST NOT execute hooks silently.

This model treats the user as the trust boundary. The template declares intent; the consumer and user decide whether to act on it.

### 7.4 Environment

Consumers SHOULD make the following environment variables available to hooks:

| Variable | Value |
|---|---|
| `NANOHYPE_TEMPLATE_NAME` | The template `name`. |
| `NANOHYPE_OUTPUT_DIR` | Absolute path to the output root. |

Consumers MAY expose resolved template variables as environment variables (e.g. `NANOHYPE_VAR_ProjectName`). This is optional and not guaranteed — hook authors SHOULD NOT depend on it without checking.

---

## 8. Composition

The `composition` field is purely advisory metadata. It helps users discover template combinations but imposes no constraints on consumers.

### 8.1 `pairsWith`

An array of template `name` values that are designed to work alongside this template. Example: a `go-cli` template might pair with an `eval-harness` template that adds evaluation scaffolding.

Consumers MAY surface these as suggestions after scaffolding (e.g. "This template pairs well with: eval-harness").

### 8.2 `nestsInside`

An array of template `name` values within whose output this template can be scaffolded as a subdirectory. Example: a `go-service` template might declare that it nests inside a `monorepo` template.

Consumers MAY use this to offer nested scaffolding workflows. There is no structural enforcement — the template simply declares the intent.

### 8.3 Rules

- All referenced template names SHOULD exist in the catalog. Consumers MUST NOT fail if a referenced template is absent (it may be in a different catalog or not yet published).
- Composition is not transitive. If A pairsWith B and B pairsWith C, that implies nothing about A and C.

---

## 9. Prerequisites

Prerequisites declare external tools the scaffolded output (or hooks) depend on.

### 9.1 When to Check

Consumers SHOULD check prerequisites **before running hooks** (step 4 in the lifecycle). Checking before skeleton expansion is also acceptable.

### 9.2 How to Check

- **Presence:** The consumer checks whether `name` is available on `$PATH` (or platform equivalent).
- **Version:** If `version` is specified, the consumer SHOULD attempt to determine the installed version (e.g. `go version`, `node --version`) and evaluate the semver range. Version checking is best-effort — consumers MUST NOT fail if they cannot parse the version output.

### 9.3 Failure Behavior

| `optional` | Prerequisite missing | Behavior |
|---|---|---|
| `false` (default) | yes | Consumer MUST warn the user. Consumer SHOULD block and MAY proceed if the user explicitly overrides. |
| `true` | yes | Consumer MUST warn the user. Consumer MUST NOT block. |

The warning MUST include the `purpose` field so the user understands what will not work.

---

## 10. Versioning

### 10.1 `apiVersion` Policy

- The current schema version is `nanohype/v1`.
- Consumers MUST reject manifests with an unrecognized `apiVersion`.
- A new minor revision (e.g. adding optional fields) will not change `apiVersion`. Existing consumers will continue to work because unknown fields are ignored.
- A breaking change (removing fields, changing semantics of existing fields, adding new required fields) will increment the version (e.g. `nanohype/v2`).

### 10.2 Backward Compatibility Guarantees

Within a given `apiVersion`:

- No required field will be removed.
- No optional field will become required.
- No field's type or semantics will change.
- New optional fields MAY be added. Consumers MUST ignore fields they do not recognize.

### 10.3 Template `version`

The template's own `version` field follows semver and tracks changes to the template content (skeleton files, variables, hooks, etc.). It is independent of `apiVersion`. Template authors SHOULD increment the version when the generated output changes in a meaningful way.

---

## 11. Validation

### 11.1 Manifest Validation

The canonical JSON Schema for `nanohype/v1` manifests is maintained alongside this spec. Consumers MUST validate every manifest against this schema before processing. Validation SHOULD use ajv or any JSON Schema draft-07+ compliant validator.

### 11.2 Structural Invariants

Beyond schema validation, consumers MUST enforce:

1. Every `conditionals[].when` value references a variable with `type: bool`.
2. Every variable's `placeholder` is unique — no two variables share the same placeholder.
3. No placeholder is a substring of another placeholder in the same template.
4. Every `enum`-typed variable has a non-empty `options` array.
5. Every `default` value matches its variable's `type`.
6. Default value cross-references (`${VariableName}`) do not form cycles.
7. `name` field matches the directory name in the catalog.

---

## 12. Consumer Implementation Guide

This section is for implementors building a scaffolding tool that consumes nanohype templates. It consolidates the MUST/SHOULD requirements from the rest of this spec into a sequential algorithm.

### 12.1 Discovery

A consumer reads templates from a local directory or a git repository. Each subdirectory of `templates/` with a `template.yaml` file is a template. The consumer:

1. Lists `templates/*/template.yaml` to discover available templates.
2. Parses each manifest to extract `name`, `displayName`, `description`, `tags` for presentation.
3. Optionally filters by `tags` or `name` to help the user select.

### 12.2 Scaffolding Algorithm

Given a selected template name and an output directory:

```text
 1. PARSE     Read templates/<name>/template.yaml as YAML.
 2. VALIDATE  Validate manifest against schemas/template.schema.json (JSON Schema draft 2020-12).
              Enforce structural invariants (section 11.2):
              - conditionals[].when references a bool variable
              - placeholders are unique and non-overlapping
              - enum variables have options
              - default values match types
              - cross-reference defaults don't cycle
 3. COLLECT   Present variables to the user in array order.
              For each variable:
              - Show prompt (or name if no prompt)
              - Show description, type, default, options (if enum)
              - If required and no default → user MUST supply a value
              - If not required and user skips → use default or type zero-value
                (empty string for string/enum, false for bool, 0 for int)
 4. RESOLVE   Resolve default cross-references: replace ${VarName} in defaults
              with the collected value for that variable. Detect cycles → reject.
 5. VALIDATE  Apply validation.pattern to string values. Reject on mismatch
              with validation.message (or generic error).
 6. PREREQS   For each prerequisite, check presence on $PATH.
              Check version if version field is set (best-effort).
              Required prereq missing → warn + block (user may override).
              Optional prereq missing → warn only.
 7. PRE-HOOKS Run hooks.pre[] in array order (if user approves).
              Display name, description, run command BEFORE execution.
              Shell: sh -c "<run>" in workdir (relative to output root).
              Non-zero exit → report, optionally abort.
 8. RENDER    Copy skeleton/ to output directory:
              a. Walk the skeleton file tree.
              b. For each file/directory path:
                 - Check conditionals: if the path matches a conditional entry
                   and the referenced bool variable is false → SKIP (do not copy).
                 - Replace all placeholder strings in the path (directory + filename).
              c. For each file's content:
                 - Read the file as text.
                 - For each variable, replace all occurrences of its placeholder
                   with the resolved value. This is literal string replacement,
                   not a template engine.
                 - Substitution is NOT recursive — a value containing a placeholder
                   string does not trigger a second pass.
                 - Write the result to the output path.
 9. POST-HOOKS Run hooks.post[] in array order (if user approves).
              Same execution model as pre-hooks.
              Environment variables available to hooks:
              - NANOHYPE_TEMPLATE_NAME, NANOHYPE_TEMPLATE_VERSION
              - NANOHYPE_OUTPUT_DIR
10. DONE      Report success. Optionally display composition.pairsWith
              as suggestions for what to scaffold next.
```

### 12.3 Minimal Consumer

A conformant consumer needs exactly these capabilities:

| Capability | Purpose |
|---|---|
| YAML parser | Read template.yaml |
| JSON Schema validator | Validate manifest against schema |
| Interactive prompts | Collect variable values from the user |
| File tree walker | Recursively copy skeleton/ |
| String replacer | Find-and-replace placeholders in content and paths |
| Shell executor | Run hook commands (optional — hooks are advisory) |
| Path checker | Verify prerequisites exist on $PATH (optional) |

No template engine, no AST manipulation, no language-specific tooling. The entire rendering algorithm is string replacement.

### 12.4 Catalog Integration

The consumer accesses the catalog via git:

```bash
git clone <catalog-repo-url>     # or sparse checkout of templates/<name>
```

Template versioning uses git tags on the catalog repo. To scaffold a specific version:

```bash
git checkout v1.2.0              # then read templates/<name>/
```

The consumer does not need a package registry, artifact store, or API server. Git is the distribution mechanism.

---

## 13. Full Example

A complete `template.yaml` for a Go CLI application:

```yaml
apiVersion: nanohype/v1

name: go-cli
displayName: "Go CLI Application"
description: >
  Scaffolds a Go CLI application using Cobra for command structure,
  Viper for configuration management, and log/slog for structured logging.
  Produces a buildable binary with a root command, version subcommand,
  config file support, and a Makefile. Optionally includes GoReleaser
  configuration and a GitHub Actions release workflow.
version: "0.1.0"
license: Apache-2.0
tags: [go, cli, cobra, viper, slog]

variables:
  - name: ProjectName
    type: string
    placeholder: "__PROJECT_NAME__"
    description: "Kebab-case project name, used as binary name and directory"
    prompt: "Project name"
    required: true
    validation:
      pattern: "^[a-z][a-z0-9-]*$"
      message: "Must be lowercase kebab-case starting with a letter"

  - name: Org
    type: string
    placeholder: "__ORG__"
    description: "GitHub organization or username"
    prompt: "GitHub org/username"
    required: true
    validation:
      pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]*$"
      message: "Must be a valid GitHub org or username"

  - name: GoModule
    type: string
    placeholder: "__GO_MODULE__"
    description: "Full Go module path"
    prompt: "Go module path"
    default: "github.com/${Org}/${ProjectName}"
    required: true
    validation:
      pattern: "^[a-z][a-z0-9./-]*$"
      message: "Must be a valid Go module path"

  - name: Description
    type: string
    placeholder: "__DESCRIPTION__"
    description: "Short project description for help text and README"
    prompt: "Project description"
    default: "A CLI application"

  - name: IncludeRelease
    type: bool
    placeholder: "__INCLUDE_RELEASE__"
    description: "Include GoReleaser configuration and GitHub Actions release workflow"
    prompt: "Include release automation?"
    default: true

  - name: LogFormat
    type: enum
    placeholder: "__LOG_FORMAT__"
    description: "Default structured log output format"
    prompt: "Log format"
    default: "json"
    options: ["json", "text", "pretty"]

conditionals:
  - path: ".goreleaser.yaml"
    when: IncludeRelease
  - path: ".github/workflows/release.yml"
    when: IncludeRelease

hooks:
  post:
    - name: install-dependencies
      description: "Initialize Go module and tidy dependencies"
      run: "go mod tidy"
      workdir: "."

composition:
  pairsWith: [eval-harness, infra-fly]
  nestsInside: [monorepo]

prerequisites:
  - name: go
    version: ">=1.24"
    purpose: "Go compilation and module management"
    optional: false
  - name: goreleaser
    version: ">=2.0"
    purpose: "Automated release builds (only needed if release config is included)"
    optional: true
```

Corresponding skeleton structure:

```text
skeleton/
  .goreleaser.yaml
  .github/
    workflows/
      ci.yml
      release.yml
  go.mod
  main.go
  Makefile
  README.md
  cmd/
    root.go
    version.go
  internal/
    config/
      config.go
```

In `skeleton/go.mod`:

```text
module __GO_MODULE__

go 1.24
```

In `skeleton/main.go`:

```go
package main

import "__GO_MODULE__/cmd"

func main() {
    cmd.Execute()
}
```

After scaffolding with `ProjectName=hype`, `Org=acme`, `GoModule=github.com/acme/hype`:

- `go.mod` contains `module github.com/acme/hype`
- `main.go` imports `github.com/acme/hype/cmd`
- `.goreleaser.yaml` and `.github/workflows/release.yml` are present (because `IncludeRelease` defaulted to `true`)
