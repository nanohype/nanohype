#!/usr/bin/env bash
# Go checks: outdated modules + go vet + go build.
#
# `go list -u -m -json all` surfaces available updates. Go skeletons
# use placeholder module paths (__GO_MODULE__), so we materialize each
# skeleton into a tmp dir with substituted placeholders before running
# go commands.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
. "${SCRIPT_DIR}/../lib/common.sh"

check_go() {
  if ! command -v go >/dev/null 2>&1; then
    log_warn "go not found — skipping Go checks"
    return 0
  fi

  local tmpl name
  while IFS= read -r tmpl; do
    [ -z "$tmpl" ] && continue
    name="$(template_name "$tmpl")"
    if is_skipped "go" "$name"; then
      log_step "go:${name} — skipped"
      continue
    fi
    log_step "go:${name}"
    _check_go_template "$tmpl"
  done < <(list_templates go)
}

_check_go_template() {
  local tmpl="$1"
  local name work
  name="$(template_name "$tmpl")"

  work="$(mktemp -d)"
  # Guarantee cleanup even on early return / error.
  trap 'rm -rf "$work"' RETURN
  cp -R "${tmpl}/skeleton/." "${work}/"

  _materialize_placeholders "$work" "$name"

  _go_outdated "$work" "$name"
  _go_build "$work" "$name"
  _go_vet "$work" "$name"
}

# Replace every __PLACEHOLDER__ token in the materialized skeleton with
# a value that lets go tooling run. We only need placeholders that are
# actually referenced by Go source / go.mod — over-substituting is fine.
_materialize_placeholders() {
  local work="$1" name="$2"
  local module="example.com/${name}"

  # Iterate over source + config files. Use `find -print0` for safety.
  find "$work" -type f \( -name "*.go" -o -name "go.mod" -o -name "Makefile" \
       -o -name "*.yaml" -o -name "*.yml" -o -name "*.md" \) \
       -print0 2>/dev/null \
  | xargs -0 perl -pi -e "
      s|__GO_MODULE__|${module}|g;
      s|__PROJECT_NAME__|${name}|g;
      s|__ORG__|acme|g;
      s|__DESCRIPTION__|Health-check project|g;
      s|__DATABASE__|postgres|g;
      s|__AUTH_PROVIDER__|jwt|g;
    "
}

_go_outdated() {
  local work="$1" name="$2"
  # Require a module first. If tidy can't run (network issues etc),
  # emit a finding and move on rather than abandoning other checks.
  if ! (cd "$work" && GOSUMDB=off go mod tidy >/dev/null 2>&1); then
    finding "error" "go" "$name" "install" "go mod tidy failed"
    return
  fi

  (cd "$work" && GOSUMDB=off go list -u -m -json all 2>/dev/null) \
  | node --input-type=module -e '
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => { buf += chunk; });
      process.stdin.on("end", () => {
        // go list -m -json emits one JSON object per module, concatenated.
        const objs = [];
        let depth = 0, start = -1;
        for (let i = 0; i < buf.length; i++) {
          const c = buf[i];
          if (c === "{") { if (depth === 0) start = i; depth++; }
          else if (c === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
              try { objs.push(JSON.parse(buf.slice(start, i + 1))); } catch {}
              start = -1;
            }
          }
        }
        for (const m of objs) {
          if (!m.Update || !m.Version || !m.Update.Version) continue;
          if (m.Main) continue;
          const current = m.Version, latest = m.Update.Version;
          const currentMajor = current.replace(/^v/, "").split(".")[0];
          const latestMajor  = latest.replace(/^v/, "").split(".")[0];
          const drift = currentMajor === latestMajor ? "minor" : "major";
          const severity = drift === "major" ? "warn" : "info";
          process.stdout.write(`${severity}\t${m.Path}\t${current}\t${latest}\t${drift}\n`);
        }
      });
    ' 2>/dev/null \
  | while IFS=$'\t' read -r severity pkg current latest drift; do
      [ -z "$pkg" ] && continue
      finding "$severity" "go" "$name" "outdated-dep" \
        "${pkg}: ${current} → ${latest} (${drift})"
    done
}

_go_build() {
  local work="$1" name="$2"
  local output
  output="$(cd "$work" && GOSUMDB=off go build ./... 2>&1 || true)"
  if [ -n "$output" ]; then
    local error_count
    error_count=$(printf '%s' "$output" | wc -l | tr -d ' ')
    finding "error" "go" "$name" "build" \
      "go build ./... failed (${error_count} lines of output)"
  fi
}

_go_vet() {
  local work="$1" name="$2"
  local output
  output="$(cd "$work" && GOSUMDB=off go vet ./... 2>&1 || true)"
  if [ -n "$output" ]; then
    local error_count
    error_count=$(printf '%s' "$output" | wc -l | tr -d ' ')
    finding "warn" "go" "$name" "vet" \
      "go vet ./... reports ${error_count} lines of output"
  fi
}
