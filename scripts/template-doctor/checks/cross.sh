#!/usr/bin/env bash
# Cross-cutting checks that don't care about ecosystem:
#   - README "Pairs with" / "Nests inside" links point at real templates
#   - template.yaml composition.pairsWith / nestsInside entries exist
#   - composites reference templates that exist
#
# No external tooling required. Shell + awk.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
. "${SCRIPT_DIR}/../lib/common.sh"

check_cross() {
  log_step "cross: template/composite references"
  _cross_readme_links
  _cross_template_yaml_refs
  _cross_composite_refs
  _cross_placeholder_dangling
}

# Scan each template's README.md for "(../<name>/)" links and confirm
# the target directory exists. Catches stale references after renames.
_cross_readme_links() {
  local tmpl name readme ref
  while IFS= read -r tmpl; do
    name="$(template_name "$tmpl")"
    readme="${tmpl}/README.md"
    [ -f "$readme" ] || continue

    # Extract ../<slug>/ segments that appear in markdown link targets.
    # `grep` exits 1 when no match — that's fine here, swallow it.
    { grep -oE '\(\.\./[a-z][a-z0-9-]*/\)' "$readme" 2>/dev/null || true; } \
      | sed -E 's|\(\.\./||; s|/\)||' \
      | sort -u \
      | while IFS= read -r ref; do
          [ -z "$ref" ] && continue
          if [ ! -d "${TEMPLATES_DIR}/${ref}" ]; then
            finding "error" "cross" "$name" "stale-readme-ref" \
              "README links to ../${ref}/ but no such template exists"
          fi
        done
  done < <(list_templates all)
}

# Parse composition.pairsWith / composition.nestsInside from each
# template.yaml and verify every named template exists.
_cross_template_yaml_refs() {
  local tmpl name ymls ref refs
  while IFS= read -r tmpl; do
    name="$(template_name "$tmpl")"
    local y="${tmpl}/template.yaml"
    [ -f "$y" ] || continue

    # Grab the array contents after pairsWith: / nestsInside:.
    refs="$(awk '
      /^[[:space:]]*pairsWith:/   { sub(/.*:[[:space:]]*\[/, ""); sub(/\].*/, ""); print; next }
      /^[[:space:]]*nestsInside:/ { sub(/.*:[[:space:]]*\[/, ""); sub(/\].*/, ""); print; next }
    ' "$y" \
    | tr ',' '\n' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/"//g; s/'"'"'//g' \
    | awk 'NF')"

    while IFS= read -r ref; do
      [ -z "$ref" ] && continue
      if [ ! -d "${TEMPLATES_DIR}/${ref}" ]; then
        finding "error" "cross" "$name" "stale-yaml-ref" \
          "template.yaml references \"${ref}\" but no such template exists"
      fi
    done <<< "$refs"
  done < <(list_templates all)
}

# Every composite's `- template: <name>` entry must resolve to a real
# templates/<name>/ directory.
_cross_composite_refs() {
  local composites="${ROOT}/composites"
  [ -d "$composites" ] || return 0

  local yml name ref
  for yml in "$composites"/*.yaml "$composites"/*.yml; do
    [ -f "$yml" ] || continue
    name="$(basename "${yml%.*}")"
    awk '/^[[:space:]]*-[[:space:]]*template:[[:space:]]*/ {
      sub(/^[[:space:]]*-[[:space:]]*template:[[:space:]]*/, "");
      gsub(/"/, ""); gsub(/'"'"'/, "");
      sub(/#.*$/, "");
      sub(/[[:space:]]+$/, "");
      print
    }' "$yml" | sort -u | while IFS= read -r ref; do
      [ -z "$ref" ] && continue
      if [ ! -d "${TEMPLATES_DIR}/${ref}" ]; then
        finding "error" "cross" "composite:${name}" "stale-composite-ref" \
          "composite references template \"${ref}\" but no such template exists"
      fi
    done
  done
}

# Placeholders declared in template.yaml must actually appear in
# skeleton/ content or filenames. `scripts/validate.sh` already enforces
# this; we re-run it per template and surface any miss as an error so
# it shows up in the doctor report alongside the rest.
_cross_placeholder_dangling() {
  local tmpl name result
  while IFS= read -r tmpl; do
    name="$(template_name "$tmpl")"
    result="$("${ROOT}/scripts/validate.sh" "$tmpl" 2>&1 || true)"
    if printf '%s' "$result" | grep -q "FAIL placeholder not found"; then
      printf '%s\n' "$result" \
        | awk '/FAIL placeholder not found/ {
            sub(/.*FAIL placeholder not found in skeleton\/ files or filenames:[[:space:]]*/, "");
            sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, "");
            print
          }' \
        | while IFS= read -r ph; do
            [ -z "$ph" ] && continue
            finding "error" "cross" "$name" "dangling-placeholder" \
              "placeholder ${ph} declared in template.yaml but unused in skeleton/"
          done
    fi
  done < <(list_templates all)
}
