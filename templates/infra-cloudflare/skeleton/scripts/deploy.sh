#!/usr/bin/env bash
set -euo pipefail

# ── Pre-deploy checks ────────────────────────────────────────────────

if ! command -v wrangler &>/dev/null; then
  echo "Error: wrangler CLI is not installed. Install with: npm i -g wrangler"
  exit 1
fi

if ! wrangler whoami &>/dev/null; then
  echo "Error: Not authenticated with Cloudflare. Run: wrangler login"
  exit 1
fi

# ── Determine environment ────────────────────────────────────────────

ENVIRONMENT="${1:-staging}"

case "$ENVIRONMENT" in
  production|staging)
    ;;
  *)
    echo "Usage: $0 [production|staging]"
    echo "  Defaults to 'staging' if not specified."
    exit 1
    ;;
esac

# ── Deploy ───────────────────────────────────────────────────────────

echo "Deploying __PROJECT_NAME__ to $ENVIRONMENT..."

if [[ "$ENVIRONMENT" == "production" ]]; then
  wrangler deploy --env production
else
  wrangler deploy --env staging
fi

echo ""
echo "Deploy complete."
