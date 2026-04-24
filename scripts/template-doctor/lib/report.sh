# Report renderer. Reads findings from $REPORT_FILE and produces the
# human-readable summary. Sourced by run.sh after all checks have
# executed.

# Usage: render_report
#
# Reads REPORT_FILE (TSV of severity / ecosystem / template / category
# / message) and prints a grouped summary. Categories surface as
# sections within each ecosystem; severities drive the emoji/color.

render_report() {
  : "${REPORT_FILE:?REPORT_FILE not set}"

  local total errors warns infos
  total=0; errors=0; warns=0; infos=0
  if [ -s "$REPORT_FILE" ]; then
    total=$(wc -l < "$REPORT_FILE" | tr -d ' ')
    errors=$(awk -F'\t' '$1=="error"' "$REPORT_FILE" | wc -l | tr -d ' ')
    warns=$(awk -F'\t' '$1=="warn"'  "$REPORT_FILE" | wc -l | tr -d ' ')
    infos=$(awk -F'\t' '$1=="info"'  "$REPORT_FILE" | wc -l | tr -d ' ')
  fi

  echo
  echo "${C_BOLD}════════════════════════════════════════════════════════${C_RESET}"
  echo "${C_BOLD} Template Doctor Report${C_RESET}"
  echo "${C_BOLD}════════════════════════════════════════════════════════${C_RESET}"
  echo

  if [ "$total" -eq 0 ]; then
    echo "${C_GREEN}No findings. Catalog looks clean.${C_RESET}"
    echo
    return 0
  fi

  echo "Findings: ${C_BOLD}${total}${C_RESET}  ·  ${C_RED}errors ${errors}${C_RESET}  ·  ${C_YELLOW}warnings ${warns}${C_RESET}  ·  ${C_DIM}info ${infos}${C_RESET}"
  echo

  # Group by ecosystem, then category.
  local ecosystem
  for ecosystem in ts go java python cross; do
    local count
    count=$(awk -F'\t' -v eco="$ecosystem" '$2==eco' "$REPORT_FILE" | wc -l | tr -d ' ')
    [ "$count" -eq 0 ] && continue
    echo "${C_BOLD}── ${ecosystem^^} ──────────────────────────────────────${C_RESET}"
    _render_ecosystem "$ecosystem"
    echo
  done
}

_render_ecosystem() {
  local ecosystem="$1"
  local categories
  categories="$(awk -F'\t' -v eco="$ecosystem" '$2==eco {print $4}' "$REPORT_FILE" \
    | sort -u)"

  local cat
  while IFS= read -r cat; do
    [ -z "$cat" ] && continue
    echo "  ${C_DIM}[${cat}]${C_RESET}"
    awk -F'\t' -v eco="$ecosystem" -v cat="$cat" \
      '$2==eco && $4==cat {printf "    %s | %s | %s\n", $1, $3, $5}' \
      "$REPORT_FILE" \
      | _colorize_findings
  done <<< "$categories"
}

_colorize_findings() {
  # Input: "severity | template | message" — colorize the severity
  # token and indent consistently.
  while IFS= read -r line; do
    case "$line" in
      *"error |"*)
        printf "    %s%s%s\n" "$C_RED" "$line" "$C_RESET"
        ;;
      *"warn |"*)
        printf "    %s%s%s\n" "$C_YELLOW" "$line" "$C_RESET"
        ;;
      *"info |"*)
        printf "    %s%s%s\n" "$C_DIM" "$line" "$C_RESET"
        ;;
      *)
        printf "    %s\n" "$line"
        ;;
    esac
  done
}

# Write a GitHub-flavored markdown version of the report to stdout.
render_markdown_report() {
  : "${REPORT_FILE:?REPORT_FILE not set}"
  local total errors warns infos
  total=0; errors=0; warns=0; infos=0
  if [ -s "$REPORT_FILE" ]; then
    total=$(wc -l < "$REPORT_FILE" | tr -d ' ')
    errors=$(awk -F'\t' '$1=="error"' "$REPORT_FILE" | wc -l | tr -d ' ')
    warns=$(awk -F'\t' '$1=="warn"'  "$REPORT_FILE" | wc -l | tr -d ' ')
    infos=$(awk -F'\t' '$1=="info"'  "$REPORT_FILE" | wc -l | tr -d ' ')
  fi

  printf "# Template Doctor Report\n\n"
  if [ "$total" -eq 0 ]; then
    printf "No findings. Catalog looks clean.\n"
    return 0
  fi
  printf "**Summary**: %d findings — %d errors, %d warnings, %d info.\n\n" \
    "$total" "$errors" "$warns" "$infos"

  local ecosystem
  for ecosystem in ts go java python cross; do
    local count
    count=$(awk -F'\t' -v eco="$ecosystem" '$2==eco' "$REPORT_FILE" | wc -l | tr -d ' ')
    [ "$count" -eq 0 ] && continue
    printf "## %s\n\n" "$(echo "$ecosystem" | tr '[:lower:]' '[:upper:]')"
    printf "| Severity | Template | Category | Message |\n"
    printf "|---|---|---|---|\n"
    awk -F'\t' -v eco="$ecosystem" \
      'BEGIN{OFS=" | "} $2==eco {
         gsub(/\|/, "\\|", $5);
         printf "| %s | %s | %s | %s |\n", $1, $3, $4, $5
       }' "$REPORT_FILE"
    printf "\n"
  done
}
