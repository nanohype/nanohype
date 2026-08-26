#!/usr/bin/env bash
set -euo pipefail

# ─── Color output ───
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' BOLD='' RESET=''
fi

pass() { echo -e "${GREEN}  PASS${RESET} $1"; }
fail() { echo -e "${RED}  FAIL${RESET} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "${YELLOW}  WARN${RESET} $1"; }

ERRORS=0

# ─── Argument check ───
if [ $# -ne 1 ]; then
  echo "Usage: $0 <template-directory>"
  echo "  e.g. $0 templates/go-cli"
  exit 1
fi

TEMPLATE_DIR="${1%/}"

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo -e "${RED}Error:${RESET} '$TEMPLATE_DIR' is not a directory"
  exit 1
fi

# The conditional-path and placeholder sections below are the only checks in
# this script that read the manifest's structure, and yq is what reads it.
# Without it they have nothing to iterate, and a section that iterates nothing
# prints no failures — so a template with a dangling conditional and unused
# placeholders reported "all checks passed". Refusing to run is the only
# honest answer: a partial pass and a full pass were indistinguishable from
# the exit code, which is what CI and the doctor both read.
if ! command -v yq >/dev/null 2>&1; then
  echo -e "${RED}Error:${RESET} yq is required and was not found on PATH."
  echo "  This script reads template.yaml with yq. Without it the conditional-path"
  echo "  and placeholder checks would examine nothing and still report success."
  echo "  Install it from https://github.com/mikefarah/yq (brew install yq)."
  exit 1
fi

TEMPLATE_NAME=$(basename "$TEMPLATE_DIR")
echo -e "${BOLD}Validating template: ${TEMPLATE_NAME}${RESET}"
echo ""

# ─── Structural checks ───

# template.yaml exists
if [ -f "$TEMPLATE_DIR/template.yaml" ]; then
  pass "template.yaml exists"
else
  fail "template.yaml not found"
fi

# skeleton/ directory exists and is non-empty
if [ -d "$TEMPLATE_DIR/skeleton" ]; then
  # `-print -quit` rather than `| head -1`. Under this script's `set -euo
  # pipefail`, `head` closing the pipe kills `find` with SIGPIPE, pipefail
  # promotes 141 to the pipeline's status, and `set -e` aborts the whole script
  # here — before the schema, conditional and placeholder sections have run and
  # before the summary line prints. Whether it triggers depends on how much
  # `find` still has to write once `head` has exited, so it fires on some
  # templates and not others and on a loaded runner more than a quiet one.
  # `-quit` makes find stop on its own, so there is no pipe to break.
  file_count=$(find "$TEMPLATE_DIR/skeleton" -mindepth 1 -not -path '*/node_modules/*' -not -path '*/.git/*' -print -quit)
  if [ -n "$file_count" ]; then
    pass "skeleton/ directory exists and is non-empty"
  else
    fail "skeleton/ directory exists but is empty"
  fi
else
  fail "skeleton/ directory not found"
fi

# README.md at template root
if [ -f "$TEMPLATE_DIR/README.md" ]; then
  pass "README.md exists"
else
  fail "README.md not found at template root"
fi

# ─── JSON Schema validation ───
if [ -f "$TEMPLATE_DIR/template.yaml" ]; then
  echo ""
  echo -e "${BOLD}Schema validation:${RESET}"

  if node scripts/validate-schema.mjs \
    --schema schemas/template.schema.json \
    --data "$TEMPLATE_DIR/template.yaml" 2>&1; then
    pass "template.yaml conforms to schema"
  else
    fail "template.yaml does not conform to schema"
  fi
fi

# ─── Conditional path checks ───
if [ -f "$TEMPLATE_DIR/template.yaml" ]; then
  echo ""
  echo -e "${BOLD}Conditional path checks:${RESET}"

  has_conditionals=false

  # yq separates "the key is absent" (exit 0, no output) from "the manifest
  # could not be read" (exit 1). Collapsing the two is what made an unreadable
  # manifest look like a template with nothing to check.
  if ! paths=$(yq '.conditionals[].path' "$TEMPLATE_DIR/template.yaml"); then
    fail "template.yaml could not be read for conditional paths"
    paths=""
  fi

  if [ -n "$paths" ]; then
    has_conditionals=true
    while IFS= read -r cpath; do
      [ -z "$cpath" ] && continue
      if [ -e "$TEMPLATE_DIR/skeleton/$cpath" ]; then
        pass "conditional path exists: $cpath"
      else
        fail "conditional path missing in skeleton/: $cpath"
      fi
    done <<< "$paths"
  fi

  if [ "$has_conditionals" = false ]; then
    echo "  (no conditionals defined)"
  fi
fi

# ─── Placeholder checks ───
if [ -f "$TEMPLATE_DIR/template.yaml" ] && [ -d "$TEMPLATE_DIR/skeleton" ]; then
  echo ""
  echo -e "${BOLD}Placeholder checks:${RESET}"

  has_placeholders=false

  # Bool variables name a conditional rather than a content substitution, so
  # their placeholders are exempt from the content check below.
  read_failed=false
  if ! bool_placeholders=$(yq '.variables[] | select(.type == "bool") | .placeholder' "$TEMPLATE_DIR/template.yaml"); then
    read_failed=true
  fi
  if ! placeholders=$(yq '.variables[].placeholder' "$TEMPLATE_DIR/template.yaml"); then
    read_failed=true
  fi
  if [ "$read_failed" = true ]; then
    fail "template.yaml could not be read for placeholders"
    bool_placeholders=""
    placeholders=""
  fi

  if [ -n "$placeholders" ]; then
    has_placeholders=true
    while IFS= read -r placeholder; do
      [ -z "$placeholder" ] && continue

      # Bool variables are used for conditionals, not content — skip content check
      is_bool=false
      if [ -n "$bool_placeholders" ]; then
        while IFS= read -r bp; do
          [ "$bp" = "$placeholder" ] && is_bool=true && break
        done <<< "$bool_placeholders"
      fi

      if [ "$is_bool" = true ]; then
        pass "placeholder (bool/conditional): $placeholder"
        continue
      fi

      # Check file contents and filenames in skeleton/
      found_in_content=false
      found_in_filename=false

      if grep -rq "$placeholder" "$TEMPLATE_DIR/skeleton/" 2>/dev/null; then
        found_in_content=true
      fi

      if find "$TEMPLATE_DIR/skeleton/" -name "*${placeholder}*" 2>/dev/null | grep -q .; then
        found_in_filename=true
      fi

      if [ "$found_in_content" = true ] || [ "$found_in_filename" = true ]; then
        pass "placeholder used: $placeholder"
      else
        fail "placeholder not found in skeleton/ files or filenames: $placeholder"
      fi
    done <<< "$placeholders"
  fi

  if [ "$has_placeholders" = false ]; then
    echo "  (no placeholders defined)"
  fi
fi

# ─── Summary ───
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}PASS${RESET} ${TEMPLATE_NAME} — all checks passed"
  exit 0
else
  echo -e "${RED}${BOLD}FAIL${RESET} ${TEMPLATE_NAME} — ${ERRORS} check(s) failed"
  exit 1
fi
