#!/usr/bin/env bash
# Report on the istio-recipe cluster: existence, control plane, apps namespace.

set -euo pipefail

RECIPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RECIPE_DIR/../../lib/common.sh"

require_tool kind
require_tool kubectl

CLUSTER="$(cluster_name istio)"

if ! cluster_exists "$CLUSTER"; then
  info "cluster '$CLUSTER' does not exist — run: make up RECIPE=istio"
  exit 0
fi

pass "kind cluster '$CLUSTER' exists"

current_ctx="$(kubectl config current-context 2>/dev/null || echo "")"
if [ "$current_ctx" = "kind-$CLUSTER" ]; then
  pass "kubectl context points at this cluster"
else
  warn "kubectl context is '$current_ctx' — run: kubectl config use-context kind-$CLUSTER"
fi

echo ""
info "istio-system:"
kubectl --context "kind-$CLUSTER" -n istio-system get deployment 2>/dev/null \
  | sed 's/^/    /' || warn "unable to read istio-system — is Istio installed?"

echo ""
info "apps namespace:"
label="$(kubectl --context "kind-$CLUSTER" get ns apps -o jsonpath='{.metadata.labels.istio-injection}' 2>/dev/null || echo "")"
printf "    istio-injection label: %s\n" "${label:-<unset>}"

pods="$(kubectl --context "kind-$CLUSTER" -n apps get pods --no-headers 2>/dev/null || true)"
if [ -z "$pods" ]; then
  echo "    no pods running"
else
  echo "$pods" | sed 's/^/    /'
fi
