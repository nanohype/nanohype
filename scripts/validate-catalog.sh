#!/usr/bin/env bash
set -euo pipefail

# ─── Catalog-wide validation ───────────────────────────────────────
#
# Validates the entire nanohype catalog: schema compliance, persona
# and category values, brief word counts, cross-references, and
# composite template references. Produces a summary table.
#

cd "$(dirname "$0")/.."

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
WARNINGS=0

echo -e "${BOLD}nanohype catalog validation${RESET}"
echo ""

# ─── 1. Schema validation ───
echo -e "${BOLD}1. Schema validation${RESET}"
if npm run validate:schema --silent 2>/dev/null; then
  pass "all templates pass schema validation"
else
  fail "schema validation failed"
fi
echo ""

# ─── 2-3. Persona and category value checks ───
echo -e "${BOLD}2. Persona and category values${RESET}"

KNOWN_PERSONAS="engineering design qa product marketing sales operations customer-success"
KNOWN_CATEGORIES="ai-systems applications infrastructure composable-modules design qa product marketing sales operations customer-success"

for manifest in templates/*/template.yaml; do
  tmpl=$(basename "$(dirname "$manifest")")

  # Check persona values
  personas=$(python3 -c "
import yaml, sys
with open('$manifest') as f:
    m = yaml.safe_load(f)
for p in m.get('persona', []):
    print(p)
" 2>/dev/null)

  for p in $personas; do
    if ! echo "$KNOWN_PERSONAS" | grep -qw "$p"; then
      warn "$tmpl: unknown persona '$p'"
      WARNINGS=$((WARNINGS + 1))
    fi
  done

  # Check category value
  cat_val=$(python3 -c "
import yaml
with open('$manifest') as f:
    m = yaml.safe_load(f)
print(m.get('category', ''))
" 2>/dev/null)

  if [ -n "$cat_val" ] && ! echo "$KNOWN_CATEGORIES" | grep -qw "$cat_val"; then
    warn "$tmpl: unknown category '$cat_val'"
    WARNINGS=$((WARNINGS + 1))
  fi
done
pass "persona and category values checked"
echo ""

# ─── 3. Brief word count ───
echo -e "${BOLD}3. Brief template word counts${RESET}"

for manifest in templates/brief-*/template.yaml; do
  [ -f "$manifest" ] || continue
  tmpl=$(basename "$(dirname "$manifest")")
  tmpl_dir=$(dirname "$manifest")

  kind=$(python3 -c "
import yaml
with open('$manifest') as f:
    m = yaml.safe_load(f)
print(m.get('kind', 'template'))
" 2>/dev/null)

  if [ "$kind" = "brief" ]; then
    word_count=0
    while IFS= read -r skel_file; do
      wc=$(wc -w < "$skel_file" | tr -d ' ')
      word_count=$((word_count + wc))
    done < <(find "$tmpl_dir/skeleton" -type f)

    if [ "$word_count" -lt 500 ]; then
      fail "$tmpl: skeleton has $word_count words (minimum 500)"
    else
      pass "$tmpl: $word_count words"
    fi
  fi
done
echo ""

# ─── 4. Cross-reference validation ───
echo -e "${BOLD}4. Cross-reference validation${RESET}"

# Build list of all template names
ALL_TEMPLATES=""
for d in templates/*/; do
  ALL_TEMPLATES="$ALL_TEMPLATES $(basename "$d")"
done

for manifest in templates/*/template.yaml; do
  tmpl=$(basename "$(dirname "$manifest")")

  refs=$(python3 -c "
import yaml
with open('$manifest') as f:
    m = yaml.safe_load(f)
comp = m.get('composition', {})
for r in comp.get('pairsWith', []):
    print('pairsWith', r)
for r in comp.get('nestsInside', []):
    print('nestsInside', r)
" 2>/dev/null)

  while IFS=' ' read -r ref_type ref_name; do
    [ -z "$ref_type" ] && continue
    if ! echo "$ALL_TEMPLATES" | grep -qw "$ref_name"; then
      fail "$tmpl: $ref_type references '$ref_name' which does not exist"
    fi
  done <<< "$refs"
done
pass "cross-references checked"
echo ""

# ─── 5. Composite template references ───
echo -e "${BOLD}5. Composite template references${RESET}"

for composite in composites/*.yaml; do
  [ -f "$composite" ] || continue
  comp_name=$(basename "$composite" .yaml)

  refs=$(python3 -c "
import yaml
with open('$composite') as f:
    m = yaml.safe_load(f)
for entry in m.get('templates', []):
    print(entry['template'])
" 2>/dev/null)

  for ref in $refs; do
    if ! echo "$ALL_TEMPLATES" | grep -qw "$ref"; then
      fail "composite '$comp_name': references template '$ref' which does not exist"
    fi
  done
done
pass "composite references checked"
echo ""

# ─── Summary table ───
echo -e "${BOLD}═══ Catalog Summary ═══${RESET}"
echo ""

python3 << 'PYSUM'
import os, yaml

templates_dir = "templates"
personas = {}
categories = {}
kinds = {"template": 0, "brief": 0}

for tmpl in sorted(os.listdir(templates_dir)):
    manifest_path = os.path.join(templates_dir, tmpl, "template.yaml")
    if not os.path.isfile(manifest_path):
        continue
    with open(manifest_path) as f:
        m = yaml.safe_load(f)

    kind = m.get("kind", "template")
    kinds[kind] = kinds.get(kind, 0) + 1

    for p in m.get("persona", ["engineering"]):
        personas[p] = personas.get(p, 0) + 1

    cat = m.get("category", "uncategorized")
    categories[cat] = categories.get(cat, 0) + 1

total = sum(kinds.values())

print(f"  Templates: {total}")
print(f"  Composites: {len([f for f in os.listdir('composites') if f.endswith('.yaml')])}")
print()

print("  By kind:")
for k, v in sorted(kinds.items()):
    print(f"    {k:20s} {v}")
print()

print("  By persona:")
for p, v in sorted(personas.items()):
    print(f"    {p:20s} {v}")
print()

print("  By category:")
for c, v in sorted(categories.items()):
    print(f"    {c:20s} {v}")
PYSUM

echo ""

if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}${BOLD}FAILED${RESET} — $ERRORS errors, $WARNINGS warnings"
  exit 1
else
  echo -e "${GREEN}${BOLD}PASSED${RESET} — 0 errors, $WARNINGS warnings"
  exit 0
fi
