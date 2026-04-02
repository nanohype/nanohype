#!/usr/bin/env bash
set -euo pipefail

APP_NAME="__APP_NAME__"
REDIS_NAME="${APP_NAME}-redis"

# ── Create Fly Redis (Upstash) ────────────────────────────────────────

if ! command -v flyctl &>/dev/null; then
  echo "Error: flyctl is not installed."
  exit 1
fi

echo "Creating Upstash Redis '$REDIS_NAME'..."

flyctl redis create \
  --name "$REDIS_NAME" \
  --no-replicas

# ── Attach to app ────────────────────────────────────────────────────

echo "Attaching Redis to '$APP_NAME'..."
flyctl redis attach "$REDIS_NAME" --app "$APP_NAME"

echo ""
echo "Redis is ready. REDIS_URL has been set as a secret on $APP_NAME."
