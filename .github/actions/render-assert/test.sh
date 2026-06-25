#!/usr/bin/env bash
#
# test.sh — self-test for assert.sh. The clean fixtures must pass; each dirty
# fixture must be caught in isolation. Run by the render-assert CI workflow.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
fail=0

# Clean fixtures must be accepted (empty fields, example account id, well-formed ARNs).
if bash "$HERE/assert.sh" "$HERE/testdata/clean" >/dev/null 2>&1; then
  echo "PASS: clean fixtures accepted"
else
  echo "FAIL: clean fixtures rejected"
  fail=1
fi

# Each dirty fixture must be caught on its own (scan a temp dir holding just it).
for f in zero-account placeholder empty-arn; do
  tmp="$(mktemp -d)"
  cp "$HERE/testdata/dirty/$f.yaml" "$tmp/"
  if bash "$HERE/assert.sh" "$tmp" >/dev/null 2>&1; then
    echo "FAIL: dirty fixture '$f' was not caught"
    fail=1
  else
    echo "PASS: dirty fixture '$f' caught"
  fi
  rm -rf "$tmp"
done

# An empty manifests dir is a misconfiguration (exit 2), not a silent pass.
empty="$(mktemp -d)"
if bash "$HERE/assert.sh" "$empty" >/dev/null 2>&1; then
  echo "FAIL: empty manifests dir was accepted"
  fail=1
else
  echo "PASS: empty manifests dir rejected"
fi
rm -rf "$empty"

[ "$fail" -eq 0 ] && echo "render-assert self-test: OK" || echo "render-assert self-test: FAILED" >&2
exit "$fail"
