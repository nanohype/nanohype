#!/usr/bin/env bash
# Bring up a kind cluster with the Istio demo profile installed and sidecar
# injection enabled on an `apps` namespace. Idempotent — safe to re-run.

set -euo pipefail

FLAVOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$FLAVOR_DIR/../../lib/common.sh"

require_tool kind "install via: brew install kind"
require_tool kubectl "install via: brew install kubectl"
require_tool istioctl "install via: brew install istioctl"

CLUSTER="$(cluster_name istio)"

# ── 1. Cluster ──
if cluster_exists "$CLUSTER"; then
  pass "kind cluster '$CLUSTER' already exists"
else
  info "creating kind cluster '$CLUSTER'"
  kind create cluster --config "$FLAVOR_DIR/kind-config.yaml" >/dev/null
  pass "kind cluster created"
fi

# Switch kubectl context so subsequent commands target the new cluster.
kubectl config use-context "kind-$CLUSTER" >/dev/null
pass "kubectl context: kind-$CLUSTER"

# ── 2. Istio control plane ──
if kubectl get ns istio-system >/dev/null 2>&1; then
  pass "istio-system namespace exists — assuming Istio is installed"
else
  info "installing Istio (demo profile)"
  istioctl install --set profile=demo --skip-confirmation >/dev/null
  pass "Istio installed"
fi

# Wait for the control plane to be ready before touching anything else.
info "waiting for Istio control plane"
kubectl -n istio-system rollout status deployment/istiod --timeout=120s >/dev/null
pass "istiod ready"

# ── 3. Apps namespace with sidecar injection ──
if kubectl get ns apps >/dev/null 2>&1; then
  pass "apps namespace exists"
else
  kubectl create namespace apps >/dev/null
  pass "apps namespace created"
fi

current_label="$(kubectl get ns apps -o jsonpath='{.metadata.labels.istio-injection}' 2>/dev/null || echo "")"
if [ "$current_label" != "enabled" ]; then
  kubectl label namespace apps istio-injection=enabled --overwrite >/dev/null
  pass "sidecar injection enabled on apps namespace"
else
  pass "sidecar injection already enabled on apps namespace"
fi

# ── 4. Summary ──
echo ""
info "cluster ready — next steps:"
echo "    kubectl config current-context    # should be kind-$CLUSTER"
echo "    kubectl -n apps apply -f <manifests>"
echo "    make status FLAVOR=istio"
echo "    make validate DIR=<rendered-dir>"
