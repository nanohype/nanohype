#!/usr/bin/env bash
# TypeScript checks: outdated deps + typecheck + dead-dep sweep.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
. "${SCRIPT_DIR}/../lib/common.sh"

check_ts() {
  if ! command -v npm >/dev/null 2>&1; then
    log_warn "npm not found — skipping TS checks"
    return 0
  fi

  local tmpl name
  while IFS= read -r tmpl; do
    [ -z "$tmpl" ] && continue
    name="$(template_name "$tmpl")"
    if is_skipped "ts" "$name"; then
      log_step "ts:${name} — skipped"
      continue
    fi
    log_step "ts:${name}"
    _check_ts_template "$tmpl"
  done < <(list_templates ts)
}

_check_ts_template() {
  local tmpl="$1"
  local name skeleton
  name="$(template_name "$tmpl")"
  skeleton="${tmpl}/skeleton"

  # Install once per skeleton; cached via node_modules across checks.
  if [ ! -d "${skeleton}/node_modules" ]; then
    if ! (cd "$skeleton" && npm install --silent --no-audit --no-fund >/dev/null 2>&1); then
      finding "error" "ts" "$name" "install" "npm install failed"
      return
    fi
  fi

  _ts_outdated "$tmpl" "$name"
  _ts_typecheck "$tmpl" "$name"
  _ts_dead_deps "$tmpl" "$name"
}

_ts_outdated() {
  local tmpl="$1" name="$2"
  local skeleton="${tmpl}/skeleton"

  # `npm outdated` (no --all) reports only top-level declared deps from
  # package.json, which is what we care about. --all would recurse into
  # every transitive in the lockfile and flood the report.
  # npm outdated exits 1 when there are outdated packages — that is expected.
  local json
  json="$(cd "$skeleton" && npm outdated --json 2>/dev/null || true)"
  [ -z "$json" ] || [ "$json" = "{}" ] && return 0

  # Parse in a single node pass; emit one tsv-ready line per outdated
  # package with severity picked by major-version drift.
  (cd "$skeleton" && JSON="$json" node --input-type=module -e '
    const data = JSON.parse(process.env.JSON);
    for (const [pkg, info] of Object.entries(data)) {
      if (!info || typeof info !== "object") continue;
      const current = String(info.current ?? "?");
      const latest  = String(info.latest  ?? "?");
      if (current === latest || current === "?" || latest === "?") continue;
      const drift = current.split(".")[0] === latest.split(".")[0] ? "minor" : "major";
      const severity = drift === "major" ? "warn" : "info";
      process.stdout.write(`${severity}\t${pkg}\t${current}\t${latest}\t${drift}\n`);
    }
  ') | while IFS=$'\t' read -r severity pkg current latest drift; do
    [ -z "$pkg" ] && continue
    finding "$severity" "ts" "$name" "outdated-dep" \
      "${pkg}: ${current} → ${latest} (${drift})"
  done
}

_ts_typecheck() {
  local tmpl="$1" name="$2"
  local skeleton="${tmpl}/skeleton"
  [ -f "${skeleton}/tsconfig.json" ] || return 0

  local output error_count
  output="$(cd "$skeleton" && npx --no-install tsc --noEmit 2>&1 || true)"
  error_count=$(printf '%s' "$output" | grep -cE "error TS[0-9]+" || true)
  [ "$error_count" -gt 0 ] && finding "error" "ts" "$name" "typecheck" \
    "tsc --noEmit reports ${error_count} errors"
}

_ts_dead_deps() {
  local tmpl="$1" name="$2"
  local skeleton="${tmpl}/skeleton"
  [ -d "${skeleton}/src" ] || return 0
  [ -f "${skeleton}/package.json" ] || return 0

  local deps
  deps="$(node -e '
    const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const d of Object.keys(p.dependencies || {})) process.stdout.write(d + "\n");
  ' "${skeleton}/package.json" 2>/dev/null || true)"
  [ -z "$deps" ] && return 0

  local dep
  while IFS= read -r dep; do
    [ -z "$dep" ] && continue
    # Packages often loaded via side-effectful imports or type-only
    # peers don't show up in textual grep; exempt those.
    case "$dep" in
      dotenv|@opentelemetry/*|reflect-metadata) continue ;;
    esac
    if ! grep -rq --include="*.ts" --include="*.tsx" --include="*.js" \
         --include="*.mjs" --include="*.cjs" \
         -E "from [\"']${dep}([\"'/])|require\\([\"']${dep}([\"'/])" \
         "${skeleton}/src" 2>/dev/null; then
      finding "warn" "ts" "$name" "dead-dep" \
        "dependency \"${dep}\" declared but not imported under src/"
    fi
  done <<< "$deps"
}
