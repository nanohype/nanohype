#!/usr/bin/env bash
set -euo pipefail

APP_NAME="__APP_NAME__"
REGION="__REGION__"
DB_NAME="${APP_NAME}-db"

# ── Create Fly Postgres cluster ──────────────────────────────────────

if ! command -v flyctl &>/dev/null; then
  echo "Error: flyctl is not installed."
  exit 1
fi

echo "Creating Postgres cluster '$DB_NAME' in $REGION..."

flyctl postgres create \
  --name "$DB_NAME" \
  --region "$REGION" \
  --vm-size shared-cpu-1x \
  --volume-size 1 \
  --initial-cluster-size 1

# ── Attach to app ────────────────────────────────────────────────────

echo "Attaching '$DB_NAME' to '$APP_NAME'..."
flyctl postgres attach "$DB_NAME" --app "$APP_NAME"

echo ""
echo "Postgres is ready. DATABASE_URL has been set as a secret on $APP_NAME."
echo "Connect directly: flyctl postgres connect -a $DB_NAME"
