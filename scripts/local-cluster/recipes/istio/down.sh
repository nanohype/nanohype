#!/usr/bin/env bash
# Delete the istio-recipe cluster. Idempotent — no-op if the cluster doesn't
# exist. Does not touch other kind clusters (identity, plain, etc.).

set -euo pipefail

RECIPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RECIPE_DIR/../../lib/common.sh"

require_tool kind

CLUSTER="$(cluster_name istio)"

if cluster_exists "$CLUSTER"; then
  info "deleting kind cluster '$CLUSTER'"
  kind delete cluster --name "$CLUSTER" >/dev/null
  pass "cluster deleted"
else
  pass "cluster '$CLUSTER' not present — nothing to delete"
fi
