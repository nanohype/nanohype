#!/usr/bin/env bash
# Bring up a baseline kind cluster for validating the monitoring-stack
# template. Currently ships no pre-installed operators — monitoring-stack's
# Helm chart is expected to bring its own CRDs (Prometheus Operator, etc.).
#
# When monitoring-stack hardens into a larger bundle and needs specific
# CRDs present at validation time, add their installation here. Idempotent.

set -euo pipefail

RECIPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RECIPE_DIR/../../lib/common.sh"

require_tool kind "install via: brew install kind"
require_tool kubectl "install via: brew install kubectl"

CLUSTER="$(cluster_name monitoring)"

if cluster_exists "$CLUSTER"; then
  pass "kind cluster '$CLUSTER' already exists"
else
  info "creating kind cluster '$CLUSTER'"
  kind create cluster --config "$RECIPE_DIR/kind-config.yaml" >/dev/null
  pass "kind cluster created"
fi

kubectl config use-context "kind-$CLUSTER" >/dev/null
pass "kubectl context: kind-$CLUSTER"

if kubectl get ns monitoring >/dev/null 2>&1; then
  pass "monitoring namespace exists"
else
  kubectl create namespace monitoring >/dev/null
  pass "monitoring namespace created"
fi

echo ""
info "cluster ready — next steps:"
echo "    kubectl -n monitoring apply -f <manifests>"
echo "    make status RECIPE=monitoring"
echo "    make validate DIR=<rendered-dir> RECIPE=monitoring"
