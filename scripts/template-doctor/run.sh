#!/usr/bin/env bash
# Entry point for the template doctor. Runs the selected check groups,
# aggregates findings via $REPORT_FILE, and renders a report.
#
# Usage:
#   run.sh [--only <list>] [--skip <list>] [--format text|markdown]
#   --only   comma-separated subset of {ts,go,java,python,cross} (default: all)
#   --skip   comma-separated subset to skip (runs after --only)
#   --format report format; default text. markdown is stdout-safe for PR comments.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/report.sh
. "${SCRIPT_DIR}/lib/report.sh"

ONLY="ts,go,java,python,cross"
SKIP=""
FORMAT="text"

while [ $# -gt 0 ]; do
  case "$1" in
    --only)   ONLY="$2"; shift 2 ;;
    --skip)   SKIP="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
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

  local script="${SCRIPT_DIR}/checks/${group}.sh"
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

# Report-only: always exit 0. The fix-follow-up PR flips this when we
# want to gate CI on hard errors.
exit 0
