#!/usr/bin/env bash
# Delete the monitoring-recipe cluster. Idempotent.

set -euo pipefail

RECIPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RECIPE_DIR/../../lib/common.sh"

require_tool kind

CLUSTER="$(cluster_name monitoring)"

if cluster_exists "$CLUSTER"; then
  info "deleting kind cluster '$CLUSTER'"
  kind delete cluster --name "$CLUSTER" >/dev/null
  pass "cluster deleted"
else
  pass "cluster '$CLUSTER' not present — nothing to delete"
fi
