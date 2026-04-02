# Composite Contract Specification

**Schema version:** `nanohype/v1`
**Status:** Draft
**License:** Apache-2.0

---

## 1. Overview

A **composite** defines a pre-configured stack of templates scaffolded together as a single unit. While individual templates produce standalone projects, composites produce integrated multi-template projects with shared variables, defined nesting structure, and cross-template wiring.

Composites are the bridge between the template catalog and real-world project architectures. They encode the composition patterns described in `docs/catalog.md` as executable manifests.

**Audience:** Scaffolding tool implementors, project architects.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **Composite** | A named, versioned manifest that references multiple templates and defines how they combine. |
| **Entry** | A single template reference within a composite, including its nesting path and variable overrides. |
| **Root template** | The entry marked `root: true`. Its skeleton forms the top-level directory structure. Typically `monorepo`. |
| **Path** | The directory within the root where a non-root template's skeleton is placed. |
| **Variable flow** | The mechanism by which a composite-level variable is passed to multiple template entries. |

---

## 3. File Structure

Composites live in `composites/` at the catalog root:

```text
composites/
  ai-chatbot.yaml
  document-intelligence.yaml
  internal-tool.yaml
```

Each file is a standalone composite manifest. There is no `skeleton/` directory — composites reference existing templates.

---

## 4. Schema Reference

### 4.1 Top-Level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `apiVersion` | string | **yes** | Must be `nanohype/v1`. |
| `kind` | string | **yes** | Must be `composite`. |
| `name` | string | **yes** | Kebab-case identifier, unique within the catalog. |
| `displayName` | string | **yes** | Human-readable name. |
| `description` | string | **yes** | What this composite produces. |
| `version` | string | **yes** | Semver version. |
| `tags` | string[] | **yes** | Lowercase searchable tags. |
| `templates` | Entry[] | **yes** | Ordered list of template entries. |
| `variables` | Variable[] | **yes** | Composite-level variables collected from the user. |

### 4.2 Entry Object

Each entry in `templates` references a template from the catalog:

| Field | Type | Required | Description |
|---|---|---|---|
| `template` | string | **yes** | Template name (must exist in `templates/`). |
| `path` | string | no | Directory path within the output where this template is scaffolded. Relative to root. If omitted and `root: true`, scaffolds at the top level. |
| `root` | boolean | no | If `true`, this entry's skeleton forms the top-level directory. At most one entry may be `root`. |
| `variables` | object | no | Variable overrides for this entry. Keys are variable names from the referenced template. Values may reference composite variables via `${VarName}`. |
| `condition` | string | no | Name of a composite-level bool variable. When `false`, this entry is skipped entirely. |

### 4.3 Variable Object

Same schema as template variables (section 4.2 of the template contract), but scoped to the composite. Composite variables are collected once and can flow to multiple template entries.

---

## 5. Variable Flow

Composite variables are resolved first, then passed to template entries via their `variables` overrides.

### 5.1 Syntax

Entry variable values may reference composite variables using `${VarName}`:

```yaml
variables:
  - name: ProjectName
    type: string
    required: true

templates:
  - template: ts-service
    path: apps/api
    variables:
      ProjectName: "${ProjectName}-api"
      Description: "API for ${ProjectName}"
```

### 5.2 Resolution Order

```text
1. Collect composite variable values from the user.
2. For each entry (in array order):
   a. Start with the template's own defaults.
   b. Apply entry-level variable overrides, resolving ${VarName} references.
   c. Scaffold the template at the specified path with resolved variables.
```

### 5.3 Unset Variables

If a template variable is not overridden by the entry and is not required in the template, the template's own default applies. If it is required and not overridden, the consumer must prompt the user.

---

## 6. Scaffolding Algorithm

```text
1. PARSE      Read the composite manifest.
2. VALIDATE   Validate against the composite JSON Schema.
              Verify all referenced templates exist.
3. COLLECT    Collect composite-level variable values from the user.
4. EVALUATE   Evaluate entry conditions. Remove skipped entries.
5. SCAFFOLD   For each entry (in order):
              a. Resolve entry variables (apply overrides, expand ${VarName}).
              b. If root: scaffold template at output root.
              c. If path: scaffold template at output_root/path/.
              d. Apply template's own conditionals, hooks, etc.
6. POST       Run any composite-level post-processing (future extension).
```

### 6.1 Root Entry

The root entry (if present) is scaffolded first. Its skeleton forms the top-level directory structure. Non-root entries are then scaffolded into subdirectories within it.

If no entry is marked `root`, all entries are scaffolded into their respective `path` directories under the output root.

### 6.2 Hook Execution

Each template's hooks run after that template's skeleton is rendered, scoped to its path. The working directory for hooks is the entry's output path, not the composite root.

---

## 7. Example

A full-stack AI chatbot composite:

```yaml
apiVersion: nanohype/v1
kind: composite
name: ai-chatbot
displayName: "AI Chatbot"
description: >
  Full-stack AI chatbot with agentic loop, HTTP service,
  authentication, evaluation harness, and deployment.
version: "0.1.0"
tags: [ai, chatbot, fullstack, typescript]

variables:
  - name: ProjectName
    type: string
    placeholder: "__PROJECT_NAME__"
    description: "Project name used across all templates"
    required: true
    validation:
      pattern: "^[a-z][a-z0-9-]*$"
      message: "Must be lowercase kebab-case"

  - name: LlmProvider
    type: string
    placeholder: "__LLM_PROVIDER__"
    description: "LLM provider for AI features"
    default: "anthropic"

  - name: IncludeEvals
    type: bool
    placeholder: "__INCLUDE_EVALS__"
    description: "Include evaluation harness"
    default: true

  - name: DeployTarget
    type: string
    placeholder: "__DEPLOY_TARGET__"
    description: "Deployment target template"
    default: "infra-fly"

templates:
  - template: monorepo
    root: true
    variables:
      ProjectName: "${ProjectName}"
      IncludeSharedUtils: true
      IncludeSharedUi: false

  - template: agentic-loop
    path: packages/ai
    variables:
      ProjectName: "${ProjectName}-ai"
      LlmProvider: "${LlmProvider}"
      IncludeMemory: true
      IncludeEval: false

  - template: ts-service
    path: apps/api
    variables:
      ProjectName: "${ProjectName}-api"
      IncludeAuth: true
      IncludeDocker: true

  - template: module-auth
    path: packages/auth
    variables:
      ProjectName: "${ProjectName}-auth"
      AuthProvider: "jwt"

  - template: eval-harness
    path: packages/evals
    condition: IncludeEvals
    variables:
      ProjectName: "${ProjectName}-evals"
      LlmProvider: "${LlmProvider}"

  - template: infra-fly
    path: infra
    variables:
      ProjectName: "${ProjectName}"
      AppName: "${ProjectName}"
      IncludeCi: true
```

---

## 8. Relationship to Template Contract

Composites build on the template contract — they do not replace it. Each entry in a composite is scaffolded using the standard template rendering algorithm (section 12 of the template contract). The composite adds:

- **Orchestration** — which templates, in what order
- **Nesting** — where each template's output goes
- **Variable flow** — shared values across templates
- **Conditional entries** — skip templates based on user choices

A consumer that implements the template contract can implement composite support by adding the orchestration layer described in section 6 above.
