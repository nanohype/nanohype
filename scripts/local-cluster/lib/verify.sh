#!/usr/bin/env bash
# Template-aware verification driver.
#
# Usage: verify.sh <mode> <name> [--flavor <name>] [--json]
#   mode: "template" or "composite"
#   name: template or composite name (must exist in the catalog)
#
# Renders the target with scaffold_defaults_for(), then runs each check
# declared by checks_for() against the rendered output. Reports per-check
# pass/fail and exits non-zero on any failure.
#
# Designed for CI: no interactive prompts, stable exit codes, structured
# output (--json for machine consumption), respects CI=1 / NO_COLOR.

set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"
source "$LIB_DIR/defaults.sh"

# Force plain output in CI or when NO_COLOR is set.
if [ -n "${CI:-}" ] || [ -n "${NO_COLOR:-}" ]; then
  C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_BOLD='' C_RESET=''
fi

MODE="${1:?'mode required: template|composite'}"
NAME="${2:?'name required'}"
shift 2

FLAVOR=""
FORMAT="text"
while [ $# -gt 0 ]; do
  case "$1" in
    --flavor) FLAVOR="$2"; shift 2 ;;
    --json) FORMAT="json"; shift ;;
    *) fail "unknown flag: $1" ;;
  esac
done

[ -z "$FLAVOR" ] && FLAVOR="$(default_flavor_for "$NAME")"

# ── Locate the SDK CLI (built in sdk/dist) ──
NANOHYPE_CLI="$REPO_ROOT/sdk/dist/bin/nanohype.js"
if [ ! -f "$NANOHYPE_CLI" ]; then
  info "building SDK (one-time)"
  (cd "$REPO_ROOT/sdk" && npm run --silent build) >/dev/null
fi

# ── Results aggregation ──
declare -a results
record_result() {
  # args: <check-name> <status> <detail>
  results+=("$1|$2|$3")
}

# ── Render ──
RENDERED_DIR="$(mktemp -d -t "nanohype-verify-${NAME}-XXXXXX")"
trap 'rm -rf "$RENDERED_DIR"' EXIT

info "Verifying ${C_BOLD}${MODE}/${NAME}${C_RESET} (flavor: ${FLAVOR:-none})"

mapfile -t defaults < <(scaffold_defaults_for "$NAME")
if [ "${#defaults[@]}" -eq 0 ]; then
  warn "no known defaults for '$NAME' — attempting to render with no overrides"
fi

scaffold_args=(scaffold)
if [ "$MODE" = "composite" ]; then
  scaffold_args+=(--composite)
fi
scaffold_args+=("$NAME" --local "$REPO_ROOT" -o "$RENDERED_DIR")
for arg in "${defaults[@]}"; do
  [ -n "$arg" ] && scaffold_args+=("$arg")
done

if node "$NANOHYPE_CLI" "${scaffold_args[@]}" >/dev/null 2>&1; then
  record_result render PASS "rendered to $RENDERED_DIR"
  pass "render: ok ($RENDERED_DIR)"
else
  record_result render FAIL "scaffold failed"
  fail "render: scaffold failed — re-run without redirect to see stderr"
fi

# ── Execute checks ──
CHECKS="$(checks_for "$NAME")"
if [ -z "$CHECKS" ]; then
  info "no cluster/build checks declared for '$NAME' — render-only verification"
fi

run_check_mvn() {
  if ! command -v mvn >/dev/null 2>&1; then
    record_result mvn SKIP "mvn not on PATH"
    warn "mvn: skipped (not installed)"
    return 0
  fi
  if [ ! -f "$RENDERED_DIR/pom.xml" ]; then
    record_result mvn SKIP "no pom.xml in render"
    warn "mvn: skipped (no pom.xml)"
    return 0
  fi
  info "mvn verify (may be slow — cold Maven cache)"
  if (cd "$RENDERED_DIR" && mvn -B -q verify) >/dev/null 2>&1; then
    record_result mvn PASS "mvn verify clean"
    pass "mvn verify: clean"
    return 0
  else
    record_result mvn FAIL "mvn verify failed"
    warn "mvn verify: failed (re-run manually in $RENDERED_DIR for detail)"
    return 1
  fi
}

run_check_kubectl() {
  if [ -z "$FLAVOR" ]; then
    record_result kubectl SKIP "no flavor specified"
    warn "kubectl: skipped (no flavor)"
    return 0
  fi
  local cluster; cluster="$(cluster_name "$FLAVOR")"
  local current_ctx; current_ctx="$(kubectl config current-context 2>/dev/null || echo "")"
  if [ "$current_ctx" != "kind-$cluster" ]; then
    record_result kubectl SKIP "cluster kind-$cluster not active"
    warn "kubectl: skipped — run: make up FLAVOR=$FLAVOR"
    return 0
  fi

  local errors=0 files=0
  while IFS= read -r -d '' file; do
    case "$file" in
      */chart/templates/*|*/chart/Chart.yaml|*/chart/values.yaml) continue ;;
    esac
    files=$((files + 1))
    if ! kubectl apply --dry-run=server -f "$file" >/dev/null 2>&1; then
      errors=$((errors + 1))
    fi
  done < <(find "$RENDERED_DIR" \( -name '*.yaml' -o -name '*.yml' \) -type f -print0)

  if [ "$errors" -eq 0 ]; then
    record_result kubectl PASS "$files files, 0 errors"
    pass "kubectl dry-run: $files files, 0 errors"
    return 0
  else
    record_result kubectl FAIL "$errors of $files failed"
    warn "kubectl dry-run: $errors of $files failed"
    return 1
  fi
}

run_check_istioctl() {
  if ! command -v istioctl >/dev/null 2>&1; then
    record_result istioctl SKIP "istioctl not on PATH"
    warn "istioctl: skipped (not installed)"
    return 0
  fi
  if ! command -v yq >/dev/null 2>&1; then
    record_result istioctl SKIP "yq not on PATH"
    warn "istioctl: skipped (yq not installed — brew install yq)"
    return 0
  fi
  local istio_files=()
  while IFS= read -r -d '' file; do
    case "$file" in
      */chart/templates/*) continue ;;
    esac
    local first_api; first_api=$(yq '.apiVersion // ""' "$file" 2>/dev/null | head -1)
    case "$first_api" in
      *istio.io*) istio_files+=("$file") ;;
    esac
  done < <(find "$RENDERED_DIR" \( -name '*.yaml' -o -name '*.yml' \) -type f -print0)

  if [ "${#istio_files[@]}" -eq 0 ]; then
    record_result istioctl SKIP "no Istio resources in render"
    info "istioctl: no Istio resources to analyze"
    return 0
  fi

  if istioctl analyze "${istio_files[@]}" >/dev/null 2>&1; then
    record_result istioctl PASS "${#istio_files[@]} resources analyzed"
    pass "istioctl analyze: ${#istio_files[@]} resources clean"
    return 0
  else
    record_result istioctl FAIL "issues reported — re-run manually for detail"
    warn "istioctl analyze: issues reported"
    return 1
  fi
}

run_check_helm() {
  if ! command -v helm >/dev/null 2>&1; then
    record_result helm SKIP "helm not on PATH"
    warn "helm: skipped (not installed — brew install helm)"
    return 0
  fi
  local charts=()
  while IFS= read -r -d '' chart_yaml; do
    charts+=("$(dirname "$chart_yaml")")
  done < <(find "$RENDERED_DIR" -name 'Chart.yaml' -type f -print0)

  if [ "${#charts[@]}" -eq 0 ]; then
    record_result helm SKIP "no Helm charts in render"
    info "helm: no charts to lint"
    return 0
  fi

  local errors=0
  for chart in "${charts[@]}"; do
    if ! helm lint "$chart" >/dev/null 2>&1; then
      errors=$((errors + 1))
    fi
  done

  if [ "$errors" -eq 0 ]; then
    record_result helm PASS "${#charts[@]} charts linted"
    pass "helm lint: ${#charts[@]} charts clean"
    return 0
  else
    record_result helm FAIL "$errors of ${#charts[@]} charts failed lint"
    warn "helm lint: $errors of ${#charts[@]} charts failed"
    return 1
  fi
}

overall_exit=0
for check in $CHECKS; do
  case "$check" in
    mvn)      run_check_mvn      || overall_exit=1 ;;
    kubectl)  run_check_kubectl  || overall_exit=1 ;;
    istioctl) run_check_istioctl || overall_exit=1 ;;
    helm)     run_check_helm     || overall_exit=1 ;;
    *) warn "unknown check: $check" ;;
  esac
done

# ── Report ──
if [ "$FORMAT" = "json" ]; then
  # Emit a single JSON object. No external tool needed.
  printf '{\n  "mode": "%s",\n  "name": "%s",\n  "flavor": "%s",\n  "checks": [\n' \
    "$MODE" "$NAME" "$FLAVOR"
  local_i=0
  for r in "${results[@]}"; do
    IFS='|' read -r ck st dt <<< "$r"
    [ "$local_i" -gt 0 ] && printf ',\n'
    printf '    {"check": "%s", "status": "%s", "detail": "%s"}' "$ck" "$st" "$dt"
    local_i=$((local_i + 1))
  done
  printf '\n  ],\n  "overall": "%s"\n}\n' "$( [ "$overall_exit" -eq 0 ] && echo PASS || echo FAIL )"
else
  echo ""
  info "Summary"
  for r in "${results[@]}"; do
    IFS='|' read -r ck st dt <<< "$r"
    case "$st" in
      PASS) printf "  ${C_GREEN}%-4s${C_RESET}  %-10s  %s\n" PASS "$ck" "$dt" ;;
      SKIP) printf "  ${C_YELLOW}%-4s${C_RESET}  %-10s  %s\n" SKIP "$ck" "$dt" ;;
      FAIL) printf "  ${C_RED}%-4s${C_RESET}  %-10s  %s\n" FAIL "$ck" "$dt" ;;
    esac
  done
fi

exit "$overall_exit"
