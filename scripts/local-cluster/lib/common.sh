#!/usr/bin/env bash
# Shared helpers for the local-cluster harness. Source, don't execute.

set -euo pipefail

# ── Color output (only when stdout is a TTY) ──
if [ -t 1 ]; then
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'
  C_BOLD='\033[1m'
  C_RESET='\033[0m'
else
  C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_BOLD='' C_RESET=''
fi

info()  { printf "${C_BLUE}==>${C_RESET} %s\n" "$*"; }
pass()  { printf "${C_GREEN}  ok${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}warn${C_RESET} %s\n" "$*" >&2; }
fail()  { printf "${C_RED}fail${C_RESET} %s\n" "$*" >&2; exit 1; }

# ── Tool presence checks ──
# Usage: require_tool <binary> "<install hint>"
require_tool() {
  local bin="$1"
  local hint="${2:-}"
  if ! command -v "$bin" >/dev/null 2>&1; then
    local msg="required tool not found on PATH: $bin"
    [ -n "$hint" ] && msg+=" — $hint"
    fail "$msg"
  fi
}

# ── Cluster naming ──
# Every flavor's cluster is named nanohype-<flavor>. This is the single source
# of truth — flavor scripts source this helper rather than hardcoding names.
cluster_name() {
  echo "nanohype-${1:?flavor required}"
}

# ── Existence check ──
cluster_exists() {
  local name="$1"
  kind get clusters 2>/dev/null | grep -qx "$name"
}

# ── Repo-relative paths ──
# Flavors source this file from scripts/local-cluster/lib/. Derive the repo
# root relative to that for locating flavor subdirs and shared resources.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_CLUSTER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$LOCAL_CLUSTER_DIR/../.." && pwd)"
export SCRIPT_DIR LOCAL_CLUSTER_DIR REPO_ROOT
