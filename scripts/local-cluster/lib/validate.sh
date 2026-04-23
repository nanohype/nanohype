#!/usr/bin/env bash
# Validate a rendered manifest tree against the current cluster.
#
# Usage: validate.sh <rendered-dir> [<recipe>]
#
# Runs kubectl server-side dry-run across every YAML in the tree (server-side
# so custom resources like Istio's are validated against installed CRDs), then
# runs istioctl analyze against any file whose apiVersion is *.istio.io.

set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"

RENDERED_DIR="${1:?rendered directory required}"
RECIPE="${2:-istio}"

require_tool kubectl
require_tool yq "install via: brew install yq"

# Confirm the cluster is up and kubectl is pointed at it.
CLUSTER="$(cluster_name "$RECIPE")"
CURRENT_CTX="$(kubectl config current-context 2>/dev/null || echo "")"
if [ "$CURRENT_CTX" != "kind-$CLUSTER" ]; then
  fail "kubectl context is '$CURRENT_CTX', expected 'kind-$CLUSTER'. Run: make up RECIPE=$RECIPE"
fi

info "Validating against cluster ${C_BOLD}${CLUSTER}${C_RESET}"
info "Source: $RENDERED_DIR"

# ── Phase 1: kubectl dry-run-server over every YAML ──
# --recursive so subdirs (k8s/, istio/, chart/templates/) are all covered.
# 2>&1 | tee so both pass and error output reach the user.

apply_errors=0
yaml_files=0

while IFS= read -r -d '' file; do
  # Path-level skips: Helm template sources (Go template syntax), known
  # non-k8s locations (CI workflows, docker-compose files).
  case "$file" in
    */chart/templates/*|*/chart/Chart.yaml|*/chart/values.yaml) continue ;;
    */.github/workflows/*) continue ;;
    */docker-compose.yml|*/docker-compose.yaml|*/compose.yml|*/compose.yaml) continue ;;
  esac
  # Content-level skip: a YAML with no `apiVersion` + `kind` at root isn't
  # a k8s manifest (Spring application.yaml, raw configs, etc.). Skip
  # rather than fail, since it's never going to be kubectl-applicable.
  if ! grep -qE '^apiVersion:' "$file" || ! grep -qE '^kind:' "$file"; then
    continue
  fi

  yaml_files=$((yaml_files + 1))
  if ! kubectl apply --dry-run=server -f "$file" 2>&1 | sed 's/^/    /'; then
    apply_errors=$((apply_errors + 1))
    warn "dry-run failed for: $file"
  fi
done < <(find "$RENDERED_DIR" \( -name '*.yaml' -o -name '*.yml' \) -type f -print0)

echo ""
if [ "$apply_errors" -eq 0 ]; then
  pass "kubectl dry-run: ${yaml_files} files validated, 0 errors"
else
  warn "kubectl dry-run: ${yaml_files} files validated, ${apply_errors} errors"
fi

# ── Phase 2: istioctl analyze on any Istio-typed manifests ──

if ! command -v istioctl >/dev/null 2>&1; then
  warn "istioctl not on PATH — skipping Istio-specific analysis"
  exit "$apply_errors"
fi

# Collect files whose first document's apiVersion contains 'istio.io'.
istio_files=()
while IFS= read -r -d '' file; do
  case "$file" in
    */chart/templates/*) continue ;;
  esac
  first_api=$(yq '.apiVersion // ""' "$file" 2>/dev/null | head -1)
  case "$first_api" in
    *istio.io*) istio_files+=("$file") ;;
  esac
done < <(find "$RENDERED_DIR" \( -name '*.yaml' -o -name '*.yml' \) -type f -print0)

if [ "${#istio_files[@]}" -eq 0 ]; then
  info "no Istio resources in tree — skipping istioctl analyze"
  exit "$apply_errors"
fi

info "istioctl analyze on ${#istio_files[@]} Istio resource(s)"
if istioctl analyze --all-namespaces "${istio_files[@]}"; then
  pass "istioctl analyze: no issues"
else
  warn "istioctl analyze reported issues — see above"
  apply_errors=$((apply_errors + 1))
fi

exit "$apply_errors"
