#!/usr/bin/env bash
# Entry point for the template doctor. Runs the selected check groups,
# aggregates findings via $REPORT_FILE, and renders a report.
#
# Usage:
#   run.sh [--only <list>] [--skip <list>] [--format text|markdown] [--fail-on <sev>]
#   --only    comma-separated subset of {ts,go,java,python,cross} (default: all)
#   --skip    comma-separated subset to skip (runs after --only)
#   --format  report format; default text. markdown is stdout-safe for PR comments.
#   --fail-on exit non-zero on a finding at/above {error|warn|info}; default off (report-only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Capture the checks dir before sourcing anything: each check script resets
# SCRIPT_DIR to its own location when sourced, which would otherwise corrupt the
# per-group lookup below into <dir>/checks/checks/<group>.sh and skip every
# group after the first.
CHECKS_DIR="${SCRIPT_DIR}/checks"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/report.sh
. "${SCRIPT_DIR}/lib/report.sh"

ONLY="ts,go,java,python,cross"
SKIP=""
FORMAT="text"
FAIL_ON=""

while [ $# -gt 0 ]; do
  case "$1" in
    --only)    ONLY="$2"; shift 2 ;;
    --skip)    SKIP="$2"; shift 2 ;;
    --format)  FORMAT="$2"; shift 2 ;;
    --fail-on) FAIL_ON="$2"; shift 2 ;;
    -h|--help)
      sed -n '3,9p' "$0" >&2
      exit 0
      ;;
    *) log_err "Unknown option: $1"; exit 2 ;;
  esac
done

# Fresh report file.
: > "$REPORT_FILE"

run_group() {
  local group="$1"
  case ",$ONLY," in *",$group,"*) ;; *) return 0 ;; esac
  case ",$SKIP," in *",$group,"*) return 0 ;; esac

  local script="${CHECKS_DIR}/${group}.sh"
  [ -f "$script" ] || { log_warn "no check script for ${group}"; return 0; }

  # shellcheck source=/dev/null
  . "$script"
  case "$group" in
    ts)     check_ts ;;
    go)     check_go ;;
    java)   check_java ;;
    python) check_python ;;
    cross)  check_cross ;;
  esac
}

log_step "template-doctor running (only=${ONLY}, skip=${SKIP:-none})"
run_group cross
run_group ts
run_group go
run_group java
run_group python

case "$FORMAT" in
  text)     render_report ;;
  markdown) render_markdown_report ;;
  *) log_err "Unknown format: $FORMAT"; exit 2 ;;
esac

# Report-only by default. With `--fail-on <severity>`, exit non-zero when the
# report holds a finding at or above that severity, so CI can gate on it.
case "$FAIL_ON" in
  "") ;;
  error | warn | info)
    if awk -F'\t' -v lvl="$FAIL_ON" '
          function rank(s) { return s == "error" ? 3 : s == "warn" ? 2 : s == "info" ? 1 : 0 }
          rank($1) >= rank(lvl) { found = 1 }
          END { exit found ? 0 : 1 }
        ' "$REPORT_FILE"; then
      log_err "template-doctor: findings at or above '${FAIL_ON}' severity (see report above)"
      exit 1
    fi
    ;;
  *)
    log_err "Unknown --fail-on: ${FAIL_ON} (expected error|warn|info)"
    exit 2
    ;;
esac
exit 0
