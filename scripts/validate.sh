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
  file_count=$(find "$TEMPLATE_DIR/skeleton" -mindepth 1 -not -path '*/node_modules/*' -not -path '*/.git/*' | head -1)
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

  if npx ajv validate \
    -s schemas/template.schema.json \
    -d "$TEMPLATE_DIR/template.yaml" \
    --spec=draft2020 \
    --strict=false 2>&1; then
    pass "template.yaml conforms to schema"
  else
    fail "template.yaml does not conform to schema"
  fi
fi

# ─── YAML field extraction ───
# Prefer yq, fall back to grep/sed
extract_yaml_list() {
  local file="$1"
  local field="$2"

  if command -v yq &>/dev/null; then
    yq -r "$field" "$file" 2>/dev/null || true
  else
    # Fallback: not used if yq is present
    echo ""
  fi
}

# ─── Conditional path checks ───
if [ -f "$TEMPLATE_DIR/template.yaml" ]; then
  echo ""
  echo -e "${BOLD}Conditional path checks:${RESET}"

  has_conditionals=false

  if command -v yq &>/dev/null; then
    paths=$(yq '.conditionals[].path' "$TEMPLATE_DIR/template.yaml" 2>/dev/null || true)
  else
    # Fallback: extract paths after "path:" lines within conditionals block
    paths=$(sed -n '/^conditionals:/,/^[^ ]/{ /^  *- *path:/s/.*path: *//p; /^  *path:/s/.*path: *//p }' "$TEMPLATE_DIR/template.yaml" 2>/dev/null | tr -d '"' | tr -d "'" || true)
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

  # Get bool variable names (used for conditionals, not content substitution)
  if command -v yq &>/dev/null; then
    bool_placeholders=$(yq '.variables[] | select(.type == "bool") | .placeholder' "$TEMPLATE_DIR/template.yaml" 2>/dev/null || true)
    placeholders=$(yq '.variables[].placeholder' "$TEMPLATE_DIR/template.yaml" 2>/dev/null || true)
  else
    bool_placeholders=""
    placeholders=$(sed -n '/^variables:/,/^[^ ]/{ /placeholder:/s/.*placeholder: *//p }' "$TEMPLATE_DIR/template.yaml" 2>/dev/null | tr -d '"' | tr -d "'" || true)
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
