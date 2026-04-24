# Shared helpers for the template doctor. Sourced by each check script.
#
# Finding model: every check emits zero or more `finding` lines to a
# report file. A finding is a tab-separated tuple of
#
#   <severity>\t<ecosystem>\t<template>\t<category>\t<message>
#
# Severity is one of: error | warn | info.
# The report renderer (report.sh) reads the file and produces the summary.
#
# The doctor is report-only by design — individual check scripts never
# exit non-zero on findings. They exit non-zero only when they cannot
# run at all (missing tool, hard error in the checker itself).

set -euo pipefail

# --- paths --------------------------------------------------------------------

# ROOT: repository root, two levels up from scripts/template-doctor/lib/.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEMPLATES_DIR="${ROOT}/templates"

# REPORT_FILE: set by run.sh before sourcing check scripts. Check
# scripts append findings via the `finding` helper; report.sh reads it.
: "${REPORT_FILE:=${ROOT}/scripts/template-doctor/.report.tsv}"

# --- terminal formatting ------------------------------------------------------

if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_GREEN=$'\033[32m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_RED=""
  C_YELLOW=""
  C_BLUE=""
  C_GREEN=""
  C_DIM=""
  C_BOLD=""
  C_RESET=""
fi

log() { printf "%s\n" "$*" >&2; }
log_step() { printf "%s▸%s %s\n" "$C_BLUE" "$C_RESET" "$*" >&2; }
log_ok() { printf "%s✓%s %s\n" "$C_GREEN" "$C_RESET" "$*" >&2; }
log_warn() { printf "%s⚠%s %s\n" "$C_YELLOW" "$C_RESET" "$*" >&2; }
log_err() { printf "%s✗%s %s\n" "$C_RED" "$C_RESET" "$*" >&2; }

# --- finding emission ---------------------------------------------------------

# Usage: finding <severity> <ecosystem> <template> <category> <message>
finding() {
  local severity="$1" ecosystem="$2" template="$3" category="$4" message="$5"
  printf "%s\t%s\t%s\t%s\t%s\n" \
    "$severity" "$ecosystem" "$template" "$category" "$message" \
    >> "$REPORT_FILE"
}

# --- ecosystem detection ------------------------------------------------------

# Echoes the ecosystem name for a template directory, or "none" if we
# can't tell. Ecosystem is derived from the presence of marker files in
# the skeleton. Some templates legitimately ship no code (briefs,
# markdown-only scaffolds) — those return "none" and are skipped.
ecosystem_of() {
  local tmpl="$1"
  local sk="${tmpl}/skeleton"
  [ -d "$sk" ] || { echo "none"; return; }

  if [ -f "${sk}/package.json" ]; then
    echo "ts"
  elif [ -f "${sk}/go.mod" ]; then
    echo "go"
  elif [ -f "${sk}/pom.xml" ] || [ -f "${sk}/build.gradle" ] || [ -f "${sk}/build.gradle.kts" ]; then
    echo "java"
  elif [ -f "${sk}/pyproject.toml" ] || [ -f "${sk}/requirements.txt" ]; then
    echo "python"
  else
    echo "none"
  fi
}

# list_templates <ecosystem>
# Echoes one template absolute path per line. Pass "all" to list every
# template regardless of ecosystem.
list_templates() {
  local want="$1"
  local tmpl ecosystem
  for tmpl in "${TEMPLATES_DIR}"/*/; do
    tmpl="${tmpl%/}"
    [ -d "$tmpl" ] || continue
    [ -f "${tmpl}/template.yaml" ] || continue
    if [ "$want" = "all" ]; then
      echo "$tmpl"
      continue
    fi
    ecosystem="$(ecosystem_of "$tmpl")"
    if [ "$ecosystem" = "$want" ]; then
      echo "$tmpl"
    fi
  done
}

template_name() {
  basename "$1"
}

# --- skip-list handling -------------------------------------------------------

# Some templates are legitimately not meant to run the full build check
# (e.g., templates that use __PLACEHOLDER__ directory names that break
# package managers before rendering). Skip by setting SKIP_<ECOSYSTEM>
# env vars to comma-separated template names.
is_skipped() {
  local ecosystem="$1" name="$2"
  local varname skip_list
  varname="SKIP_$(printf '%s' "$ecosystem" | tr '[:lower:]' '[:upper:]')"
  skip_list="${!varname:-}"
  [ -z "$skip_list" ] && return 1
  case ",${skip_list}," in
    *",${name},"*) return 0 ;;
    *) return 1 ;;
  esac
}
