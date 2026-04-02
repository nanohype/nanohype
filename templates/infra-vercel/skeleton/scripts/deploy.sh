#!/usr/bin/env bash
set -euo pipefail

# ── Pre-deploy checks ────────────────────────────────────────────────

if ! command -v vercel &>/dev/null; then
  echo "Error: vercel CLI is not installed. Install with: npm i -g vercel"
  exit 1
fi

if ! vercel whoami &>/dev/null; then
  echo "Error: Not authenticated with Vercel. Run: vercel login"
  exit 1
fi

# ── Determine environment ────────────────────────────────────────────

ENVIRONMENT="${1:-preview}"

if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "preview" ]]; then
  echo "Usage: $0 [production|preview]"
  echo "  Defaults to 'preview' if not specified."
  exit 1
fi

# ── Deploy ───────────────────────────────────────────────────────────

echo "Deploying __PROJECT_NAME__ to $ENVIRONMENT..."

if [[ "$ENVIRONMENT" == "production" ]]; then
  vercel --prod --yes
else
  vercel --yes
fi

echo ""
echo "Deploy complete."
