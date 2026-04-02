#!/usr/bin/env bash
set -euo pipefail

APP_NAME="__APP_NAME__"
REGION="__REGION__"

# ── Pre-deploy checks ────────────────────────────────────────────────

if ! command -v flyctl &>/dev/null; then
  echo "Error: flyctl is not installed. Install from https://fly.io/docs/flyctl/install/"
  exit 1
fi

if ! flyctl auth whoami &>/dev/null; then
  echo "Error: Not authenticated with Fly.io. Run: flyctl auth login"
  exit 1
fi

# Check if app exists, create if not
if ! flyctl status --app "$APP_NAME" &>/dev/null; then
  echo "App '$APP_NAME' not found. Creating..."
  flyctl apps create "$APP_NAME" --org personal
fi

# ── Deploy ────────────────────────────────────────────────────────────

echo "Deploying $APP_NAME to $REGION..."
flyctl deploy \
  --app "$APP_NAME" \
  --region "$REGION" \
  --strategy rolling \
  --wait-timeout 300

echo "Deploy complete. Status:"
flyctl status --app "$APP_NAME"
