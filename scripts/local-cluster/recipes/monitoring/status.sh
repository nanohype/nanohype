#!/usr/bin/env bash
# Report on the monitoring-recipe cluster.

set -euo pipefail

RECIPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RECIPE_DIR/../../lib/common.sh"

require_tool kind
require_tool kubectl

CLUSTER="$(cluster_name monitoring)"

if ! cluster_exists "$CLUSTER"; then
  info "cluster '$CLUSTER' does not exist — run: make up RECIPE=monitoring"
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
info "monitoring namespace:"
pods="$(kubectl --context "kind-$CLUSTER" -n monitoring get pods --no-headers 2>/dev/null || true)"
if [ -z "$pods" ]; then
  echo "    no pods running"
else
  echo "$pods" | sed 's/^/    /'
fi

echo ""
info "installed CRDs (Prometheus Operator / Grafana / Loki):"
kubectl --context "kind-$CLUSTER" get crds -o name 2>/dev/null \
  | grep -iE "(monitoring\.coreos\.com|grafana|loki)" \
  | sed 's/^/    /' || echo "    none (monitoring-stack hasn't been applied yet)"
