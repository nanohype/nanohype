#!/usr/bin/env bash
# Standards checks: skeleton test configuration against standards/*.json.
#
# The analysis lives in standards.mjs — it reads the published floor out of
# standards/testing-rubric.json and compares every skeleton's runner config
# against it, in both directions (a shortfall must be declared; a declaration
# must still match its config). This wrapper turns its TSV into findings.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
. "${SCRIPT_DIR}/../lib/common.sh"

check_standards() {
  if ! command -v node >/dev/null 2>&1; then
    log_warn "node not found — skipping standards checks"
    return 0
  fi

  log_step "standards: skeleton configs against standards/*.json"

  local output status=0
  output="$(node "${SCRIPT_DIR}/standards.mjs" 2>&1)" || status=$?
  if [ "$status" -ne 0 ]; then
    # The analysis itself failed — a malformed standards file, an unreadable
    # skeleton. Reported rather than swallowed: a checker that cannot run and
    # says nothing is indistinguishable from one that found nothing.
    #
    # Flattened to one line first. The report is TSV, so a stack trace pasted in
    # whole becomes a dozen rows the renderer counts as findings and cannot
    # attribute to any severity — the failure reads as twelve unknown problems
    # instead of one broken checker.
    finding "error" "standards" "-" "checker" \
      "standards.mjs exited ${status}: $(printf '%s' "$output" | tr '\n\t' '  ' | cut -c1-400)"
    return 0
  fi

  [ -z "$output" ] && return 0

  local severity category template message
  while IFS=$'\t' read -r severity category template message; do
    [ -z "$severity" ] && continue
    finding "$severity" "standards" "$template" "$category" "$message"
  done <<< "$output"
}
