# Consumer Implementation Guide

How to build a scaffolding tool that consumes nanohype templates. This is the action doc — read this to implement a consumer. The [template contract](template-contract.md) is the reference spec for field-level details.

---

## Discovery

A consumer reads templates from a local directory or a git repository. Each subdirectory of `templates/` with a `template.yaml` file is a template. The consumer:

1. Lists `templates/*/template.yaml` to discover available templates.
2. Parses each manifest to extract `name`, `displayName`, `description`, `tags` for presentation.
3. Optionally filters by `tags` or `name` to help the user select.

For composite stacks, read `composites/*.yaml` to discover pre-configured multi-template combinations. See the [composite contract](composite-contract.md) for that spec.

---

## Scaffolding Algorithm

Given a selected template name and an output directory:

```text
 1. PARSE     Read templates/<name>/template.yaml as YAML.

 2. VALIDATE  Validate manifest against schemas/template.schema.json
              (JSON Schema draft 2020-12).
              Enforce structural invariants:
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
              - If not required and user skips → use default or type
                zero-value (empty string for string/enum, false for
                bool, 0 for int)

 4. RESOLVE   Resolve default cross-references: replace ${VarName} in
              defaults with the collected value for that variable.
              Detect cycles → reject.

 5. VALIDATE  Apply validation.pattern to string values. Reject on
              mismatch with validation.message (or generic error).

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
                 - Check conditionals: if the path matches a
                   conditional entry and the referenced bool
                   variable is false → SKIP (do not copy).
                 - Replace all placeholder strings in the path
                   (directory + filename).

              c. For each file's content:
                 - Read the file as text.
                 - For each variable, replace all occurrences of
                   its placeholder with the resolved value. This is
                   literal string replacement, not a template engine.
                 - Substitution is NOT recursive — a value containing
                   a placeholder string does not trigger a second pass.
                 - Write the result to the output path.

 9. POST-HOOKS Run hooks.post[] in array order (if user approves).
              Same execution model as pre-hooks.
              Environment variables available to hooks:
              - NANOHYPE_TEMPLATE_NAME
              - NANOHYPE_TEMPLATE_VERSION
              - NANOHYPE_OUTPUT_DIR

10. DONE      Report success. Optionally display composition.pairsWith
              as suggestions for what to scaffold next.
```

---

## Composite Scaffolding

For composites (multi-template stacks), the algorithm wraps the single-template flow:

```text
1. PARSE      Read composites/<name>.yaml.
2. VALIDATE   Verify all referenced templates exist.
3. COLLECT    Collect composite-level variable values.
4. EVALUATE   Evaluate entry conditions. Remove skipped entries.
5. SCAFFOLD   For each entry (in order):
              a. Resolve entry variables (apply overrides, expand ${VarName}).
              b. If root: scaffold template at output root.
              c. If path: scaffold template at output_root/path/.
              d. Apply template's own conditionals, hooks, etc.
6. DONE       Report success.
```

See the [composite contract](composite-contract.md) for full details on variable flow and entry conditions.

---

## Minimal Consumer

A conformant consumer needs exactly these capabilities:

| Capability | Purpose |
|---|---|
| YAML parser | Read template.yaml and composite manifests |
| JSON Schema validator | Validate manifest against schema |
| Interactive prompts | Collect variable values from the user |
| File tree walker | Recursively copy skeleton/ |
| String replacer | Find-and-replace placeholders in content and paths |
| Shell executor | Run hook commands (optional — hooks are advisory) |
| Path checker | Verify prerequisites exist on $PATH (optional) |

No template engine, no AST manipulation, no language-specific tooling. The entire rendering algorithm is string replacement.

---

## Catalog Integration

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

## Template Selection

For programmatic template selection (e.g., an AI agent choosing templates for a client), read `docs/catalog.md` for the decision matrix. It maps client problems to template combinations.

For pre-configured stacks, read `composites/*.yaml` directly — each composite declares the exact templates, nesting structure, and variable wiring for a common engagement pattern.

---

## Reference

- [Template contract specification](template-contract.md) — field-by-field schema reference
- [Composite contract specification](composite-contract.md) — multi-template stack manifests
- [Catalog reference](../catalog.md) — decision matrix and composition map
- [JSON Schema](../../schemas/template.schema.json) — machine-readable validation schema
