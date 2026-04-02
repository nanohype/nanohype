# Contributing

Thanks for your interest in contributing a template to the nanohype catalog. This document covers the mechanics of submitting a template. For a detailed walkthrough of building one, see the [Template Authoring Guide](docs/authoring-guide.md).

---

## How to Contribute a Template

### 1. Fork and Clone

```bash
git clone https://github.com/<your-fork>/nanohype.git
cd nanohype
npm install
```

### 2. Create Your Template

Create a directory under `templates/` with three components:

```text
templates/<name>/
  template.yaml     # manifest (required)
  skeleton/          # output file tree (required)
  README.md          # documentation (recommended)
```

- The directory name must be kebab-case and must match the `name` field in `template.yaml`.
- The manifest must conform to the [Template Contract Specification](docs/spec/template-contract.md).
- The skeleton should produce real, working output when scaffolded with sensible defaults.
- The README should explain when to use the template, what it produces, and document every variable.

See the [authoring guide](docs/authoring-guide.md) for step-by-step instructions.

### 3. Validate Locally

Run schema validation:

```bash
npm run validate:schema
```

Run the full validation script:

```bash
./scripts/validate.sh templates/<name>
```

Both must pass before submitting.

### 4. Submit a Pull Request

Push your branch and open a PR against `main`. Use the checklist below in your PR description.

---

## PR Checklist

Copy this into your pull request body and check off each item:

```markdown
## Template Submission: `<name>`

- [ ] `template.yaml` has `apiVersion: nanohype/v1` and valid semver `version`
- [ ] Directory name matches the `name` field in the manifest
- [ ] All required manifest fields are present (name, displayName, description, version, tags, variables)
- [ ] Variables use PascalCase names and unique placeholders
- [ ] Every `enum` variable has a non-empty `options` array
- [ ] Conditionals reference only `bool`-typed variables
- [ ] `skeleton/` is present and produces working output with default values
- [ ] Skeleton files are as close to real, runnable code as possible
- [ ] `README.md` is included with usage guidance and a variables reference table
- [ ] `npm run validate:schema` passes
- [ ] `./scripts/validate.sh templates/<name>` passes
- [ ] Hooks (if any) are idempotent and safe to skip
- [ ] No placeholder is a substring of another placeholder
```

---

## Review Criteria

Reviewers evaluate templates on:

1. **Contract compliance** -- The manifest passes schema validation and all structural invariants hold.
2. **Skeleton quality** -- The scaffolded output compiles, runs, or is otherwise valid for its ecosystem. Files are not stubs filled with TODOs.
3. **Documentation completeness** -- The README explains when to use the template, what the output contains, and lists all variables with types and defaults.
4. **Variable design** -- Variables are well-named, have sensible defaults, include validation where appropriate, and are ordered logically.
5. **Scope** -- The template solves a real scaffolding need and does not duplicate an existing template in the catalog.

---

## Questions?

Open an issue. For questions about the manifest format, start with the [Template Contract Specification](docs/spec/template-contract.md). For authoring guidance, see the [authoring guide](docs/authoring-guide.md).
