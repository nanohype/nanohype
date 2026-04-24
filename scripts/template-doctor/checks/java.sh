#!/usr/bin/env bash
# Java / Maven checks: outdated deps + compile.
#
# Uses `mvn versions:display-dependency-updates` for dep reports and
# `mvn compile` for build verification. Materializes placeholders into
# a tmp dir so Maven can resolve module paths and package names.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
. "${SCRIPT_DIR}/../lib/common.sh"

check_java() {
  if ! command -v mvn >/dev/null 2>&1; then
    log_warn "mvn not found — skipping Java checks"
    return 0
  fi

  local tmpl name
  while IFS= read -r tmpl; do
    [ -z "$tmpl" ] && continue
    name="$(template_name "$tmpl")"
    if is_skipped "java" "$name"; then
      log_step "java:${name} — skipped"
      continue
    fi
    log_step "java:${name}"
    _check_java_template "$tmpl"
  done < <(list_templates java)
}

_check_java_template() {
  local tmpl="$1"
  local name work
  name="$(template_name "$tmpl")"

  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN
  cp -R "${tmpl}/skeleton/." "${work}/"

  _java_materialize "$work" "$name"

  _java_outdated "$work" "$name"
  _java_compile "$work" "$name"
}

_java_materialize() {
  local work="$1" name="$2"

  # Flatten the __PKG_DIR__ source tree into a real one. Templates use
  # __PKG_DIR__ as a literal directory segment so we have to rename
  # after copying, not substitute before.
  local pkg_dir_main="${work}/src/main/java/com/example/app"
  local pkg_dir_test="${work}/src/test/java/com/example/app"
  if [ -d "${work}/src/main/java/__PKG_DIR__" ]; then
    mkdir -p "$pkg_dir_main"
    cp -R "${work}/src/main/java/__PKG_DIR__/." "$pkg_dir_main/"
    rm -rf "${work}/src/main/java/__PKG_DIR__"
  fi
  if [ -d "${work}/src/test/java/__PKG_DIR__" ]; then
    mkdir -p "$pkg_dir_test"
    cp -R "${work}/src/test/java/__PKG_DIR__/." "$pkg_dir_test/"
    rm -rf "${work}/src/test/java/__PKG_DIR__"
  fi

  find "$work" -type f \( -name "*.java" -o -name "pom.xml" -o -name "*.yaml" \
       -o -name "*.yml" -o -name "*.xml" -o -name "*.md" \) \
       -print0 2>/dev/null \
  | xargs -0 perl -pi -e "
      s|__PROJECT_NAME__|${name}|g;
      s|__GROUP_ID__|com.example|g;
      s|__ARTIFACT_ID__|${name}|g;
      s|__DESCRIPTION__|Health-check project|g;
      s|__JAVA_PKG__|com.example.app|g;
      s|__PKG_DIR__|com/example/app|g;
      s|__DATABASE__|postgres|g;
      s|__OIDC_ISSUER__|https://auth.example.com|g;
      s|__ALLOWED_AUD__|${name}|g;
    "
}

_java_outdated() {
  local work="$1" name="$2"
  local output
  output="$(cd "$work" && mvn -B -q versions:display-dependency-updates 2>&1 || true)"

  # Maven output form: "  [INFO]   group:artifact ......... current -> latest"
  # Parse per-line; skip anything without the arrow.
  printf '%s\n' "$output" \
    | grep -E "\->[[:space:]]" \
    | sed -E 's/^\[INFO\][[:space:]]*//; s/^[[:space:]]+//' \
    | while IFS= read -r line; do
        # Strip the padding dots; extract "coord current -> latest".
        local coord current latest
        coord="$(printf '%s' "$line" | awk '{print $1}')"
        current="$(printf '%s' "$line" | awk -F'\\.\\.\\. ' '{print $2}' \
                   | awk '{print $1}')"
        latest="$(printf '%s' "$line" | awk -F'-> ' '{print $2}' | awk '{print $1}')"
        [ -z "$coord" ] || [ -z "$current" ] || [ -z "$latest" ] && continue
        local current_major latest_major drift severity
        current_major="${current%%.*}"
        latest_major="${latest%%.*}"
        if [ "$current_major" = "$latest_major" ]; then
          drift="minor"; severity="info"
        else
          drift="major"; severity="warn"
        fi
        finding "$severity" "java" "$name" "outdated-dep" \
          "${coord}: ${current} → ${latest} (${drift})"
      done
}

_java_compile() {
  local work="$1" name="$2"
  if ! (cd "$work" && mvn -B -q -DskipTests compile >/dev/null 2>&1); then
    finding "error" "java" "$name" "build" "mvn compile failed"
  fi
}
