#!/usr/bin/env bash
# Python checks: outdated deps + import syntax check.
#
# With a single Python template (mcp-server-python) and limited Python
# tooling we keep this light: parse pyproject.toml / requirements.txt
# for declared versions, ask PyPI for the latest release via `pip index`,
# and flag drift. Compile check via `python -m compileall` is optional.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
. "${SCRIPT_DIR}/../lib/common.sh"

check_python() {
  if ! command -v python3 >/dev/null 2>&1; then
    log_warn "python3 not found — skipping Python checks"
    return 0
  fi
  if ! command -v pip >/dev/null 2>&1 && ! command -v pip3 >/dev/null 2>&1; then
    log_warn "pip not found — skipping Python dep freshness checks"
  fi

  local tmpl name
  while IFS= read -r tmpl; do
    [ -z "$tmpl" ] && continue
    name="$(template_name "$tmpl")"
    if is_skipped "python" "$name"; then
      log_step "python:${name} — skipped"
      continue
    fi
    log_step "python:${name}"
    _check_python_template "$tmpl"
  done < <(list_templates python)
}

_check_python_template() {
  local tmpl="$1"
  local name skeleton
  name="$(template_name "$tmpl")"
  skeleton="${tmpl}/skeleton"

  _py_compile "$skeleton" "$name"
  _py_outdated "$skeleton" "$name"
}

_py_compile() {
  local skeleton="$1" name="$2"
  # Skip files with templated dir segments like __PKG__.
  local output error_count
  output="$(python3 -m compileall -q "$skeleton" 2>&1 || true)"
  error_count=$(printf '%s' "$output" | grep -cE "SyntaxError|IndentationError" || true)
  [ "$error_count" -gt 0 ] && finding "error" "python" "$name" "syntax" \
    "python3 compileall reports ${error_count} syntax errors"
}

_py_outdated() {
  local skeleton="$1" name="$2"
  local pipbin
  pipbin="$(command -v pip || command -v pip3 || true)"
  [ -z "$pipbin" ] && return 0

  # Extract declared packages from pyproject.toml (PEP 621 dependencies
  # list) or requirements.txt. Strip version specifiers and extras.
  local deps
  deps="$(python3 -c '
import re, sys, pathlib
root = pathlib.Path(sys.argv[1])
out = set()
pyproj = root / "pyproject.toml"
if pyproj.exists():
    try:
        import tomllib
    except ImportError:
        tomllib = None
    if tomllib is not None:
        try:
            with pyproj.open("rb") as f:
                data = tomllib.load(f)
        except Exception:
            data = {}
        for d in data.get("project", {}).get("dependencies", []) or []:
            m = re.match(r"^([A-Za-z0-9_.\-]+)", d)
            if m: out.add(m.group(1))
reqs = root / "requirements.txt"
if reqs.exists():
    for line in reqs.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"): continue
        m = re.match(r"^([A-Za-z0-9_.\-]+)", line)
        if m: out.add(m.group(1))
for d in sorted(out): print(d)
' "$skeleton" 2>/dev/null || true)"
  [ -z "$deps" ] && return 0

  # Query PyPI JSON API for each package — lightweight, no pip install.
  local pkg
  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    local latest
    latest="$(curl -fsSL "https://pypi.org/pypi/${pkg}/json" 2>/dev/null \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("info", {}).get("version", ""))' \
      2>/dev/null || true)"
    [ -z "$latest" ] && continue
    # We don't know the declared version precisely without a full parse;
    # just surface the latest as info so maintainers can compare.
    finding "info" "python" "$name" "latest-known" \
      "${pkg}: latest on PyPI is ${latest}"
  done <<< "$deps"
}
