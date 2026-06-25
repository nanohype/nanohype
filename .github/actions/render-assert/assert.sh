#!/usr/bin/env bash
#
# assert.sh — fail if RENDERED Kubernetes manifests carry unfilled sentinels.
#
# Scans a directory of rendered manifests (helm template / kustomize build output)
# for values that must never reach a real cluster: the zero AWS account id, literal
# placeholder tokens, and account-less IAM ARNs. This is the render-time complement
# to a source-file no-placeholders gate — it catches sentinels that only appear
# after templating: chart defaults, vendored charts, or ARNs a template builds from
# a value it never received.
#
# It deliberately does NOT flag empty `*RoleArn` / annotation fields. Those are
# legitimately empty at render time when the value is injected at sync time (an
# ArgoCD cluster Secret, EKS Pod Identity). An empty field is not a placeholder
# bug; an account-less ARN (arn:aws:iam:::role/...) is — a template that built an
# ARN from a missing account, which the empty-field case never produces.
#
# Usage: assert.sh <manifests-dir> [exclude-regex]
#   exclude-regex — optional ERE matched against "file:line:match" lines to drop
#                   known-legitimate hits (e.g. an opt-in addon's own placeholders).
set -euo pipefail

DIR="${1:-rendered}"
EXCLUDE="${2:-}"

[ -d "$DIR" ] || {
  echo "render-assert: manifests dir '$DIR' not found" >&2
  exit 2
}

# A rendered-but-empty tree means the render step produced nothing — treat that as
# a misconfiguration, not a silent pass.
count=$(find "$DIR" -type f \( -name '*.yaml' -o -name '*.yml' \) | wc -l | tr -d ' ')
[ "$count" -gt 0 ] || {
  echo "render-assert: no rendered manifests (*.yaml/*.yml) under '$DIR' to scan" >&2
  exit 2
}

# Sentinels that must never appear in a rendered manifest:
#   000000000000     — the zero AWS account id
#   PLACEHOLDER / g-PLACEHOLDER / REPLACE_ME family — unfilled placeholder tokens
#   arn:aws:iam:::   — an IAM ARN whose account segment is empty
# 111111111111 / 222222222222 are the org's intentional example account ids and
# are NOT sentinels (kept consistent with the source no-placeholders gate).
PATTERN='000000000000|PLACEHOLDER|g-PLACEHOLDER|REPLACE_ME|REPLACEME|CHANGE_ME|CHANGEME|arn:aws:iam:::'

hits=$(grep -rnEH --include='*.yaml' --include='*.yml' "$PATTERN" "$DIR" || true)

if [ -n "$hits" ] && [ -n "$EXCLUDE" ]; then
  hits=$(printf '%s\n' "$hits" | grep -vE "$EXCLUDE" || true)
fi

if [ -n "$hits" ]; then
  echo "render-assert: FAILED — unfilled sentinels in rendered output:" >&2
  printf '%s\n' "$hits" >&2
  echo "" >&2
  echo "These values must never reach a cluster. A value injected at sync time should" >&2
  echo "be absent/empty at render — not a literal sentinel, zero account id, or an" >&2
  echo "ARN missing its account." >&2
  exit 1
fi

echo "render-assert: OK — scanned $count rendered manifest(s), no sentinels."
