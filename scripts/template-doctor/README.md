# Template doctor

Catalog health tool. Runs per-ecosystem checks across every template under
`templates/` and produces a grouped report of findings (outdated
dependencies, broken builds, stale references, dead placeholders, skeleton
configs that fall below a published standard).

Two modes, and the difference matters. Scheduled and manual runs are
report-only: they exist to give maintainers visibility into catalog drift
so it can be batch-fixed intentionally rather than arriving as one-off bug
reports. **Pull requests run with `--fail-on error`**, so a hard finding
blocks the merge — drift that a maintainer would fix on their own schedule
is one thing, and landing new drift is another.

## Quick start

```sh
# All checks
make -C scripts/template-doctor doctor

# One ecosystem
make -C scripts/template-doctor ts
make -C scripts/template-doctor go
make -C scripts/template-doctor java
make -C scripts/template-doctor python
make -C scripts/template-doctor cross
make -C scripts/template-doctor standards

# Markdown report (stdout-safe for PR comments)
make -C scripts/template-doctor markdown > report.md
```

## What it checks

### Cross-cutting (`cross.sh`)

- README `(../template-name/)` links resolve to a real template
- `template.yaml` `composition.pairsWith` / `nestsInside` entries exist
- Composites' `- template: X` entries reference a real template
- Placeholders declared in `template.yaml` appear somewhere in `skeleton/`

### Standards conformance (`standards.sh` + `standards.mjs`)

Compares every skeleton's test configuration against the floor published in
`standards/testing-rubric.json` and the toolchain named in
`standards/language-toolchain.json`. The floor is read from the standard, never
copied here — a second copy is a second thing to drift.

- **TypeScript** — a coverage block exists; `coverage.enabled` is true, so
  `vitest run` actually collects and the thresholds bind; all four metrics are
  set; each is at or above the published floor.
- **Python** — pytest runs with `--cov-fail-under` at or above the floor; mypy
  is configured; black is not, since the standard's lint step is `ruff check .
  && ruff format --check .` and two formatters over the same files disagree
  eventually.
- **Go** — the Makefile defines `COVERAGE_MIN`, so `make test` enforces
  something.

A skeleton whose suite does not yet reach the floor is pinned at what it
measures and **declared** in `BELOW_FLOOR` / `GO_BELOW_FLOOR` with the reason.
The check runs both directions: an undeclared shortfall is an error, and so is a
declaration that no longer matches its config — a skeleton since raised leaves a
stale apology behind, and one whose number drifted leaves a record describing a
config that no longer exists.

The reason this group exists at all: every TypeScript skeleton in this catalog
once declared thresholds that `vitest run` never evaluated. A threshold that is
present and a threshold that binds look identical in review, so the only way to
tell them apart is a check that knows the difference.

### TypeScript (`ts.sh`)

- `npm outdated` — major-version drift as warning, minor/patch as info
- `tsc --noEmit` — non-zero error count surfaced as an error
- Dead dependencies — declared in `package.json` but not imported under `src/`

### Go (`go.sh`)

Materializes each skeleton into a tmp dir with substituted placeholders
before running Go tooling.

- `go list -u -m -json all` — drift surfaced the same way as TS
- `go build ./...` — any output is an error finding
- `go vet ./...` — any output is a warning finding

### Java (`java.sh`)

Materializes the `__PKG_DIR__` source tree into a real package path,
then runs Maven.

- `mvn versions:display-dependency-updates` — drift findings
- `mvn compile` — compile failure is an error finding

### Python (`python.sh`)

- `python3 -m compileall` — syntax errors surfaced as errors
- PyPI lookup against declared packages in `pyproject.toml` /
  `requirements.txt` — surfaces the latest known version so maintainers
  can compare against their pin

## Finding model

Every check emits zero or more lines to `$REPORT_FILE` as tab-separated
tuples:

```text
severity <TAB> ecosystem <TAB> template <TAB> category <TAB> message
```

Severities: `error`, `warn`, `info`. `report.sh` groups by ecosystem
and category when rendering.

## Adding a check

Add a new file under `checks/`, source `lib/common.sh`, and emit
findings via the `finding` helper:

```bash
finding "warn" "ts" "my-template" "my-category" "some drift detected"
```

Then add the new group name to `run.sh`'s dispatch switch.

## Skipping templates

Pass skip lists via env vars (comma-separated template names):

```sh
SKIP_TS=templates-under-heavy-rework make -C scripts/template-doctor ts
```

## Design notes

- **Report-only by design.** Checks never `exit 1` on findings; they
  only exit non-zero when the checker itself can't run. A follow-up
  will add a `--strict` mode that converts errors into a non-zero exit
  code when the catalog is clean enough to gate CI on.
- **Materialize before checking.** Go and Java skeletons use
  placeholder module paths / directories that break their native
  tooling. Each ecosystem-specific check copies the skeleton into a tmp
  dir and substitutes placeholders before running native tools.
- **No build-system flakes in findings.** Network failures during
  `npm install` / `mvn compile` are surfaced as single `install` or
  `build` findings, not cascades — the report stays skimmable when a
  mirror is misbehaving.
