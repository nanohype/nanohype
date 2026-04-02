#!/usr/bin/env bash
set -euo pipefail

GCP_PROJECT="__GCP_PROJECT__"
GCP_REGION="__GCP_REGION__"
PROJECT_NAME="__PROJECT_NAME__"
SERVICE_NAME="$PROJECT_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_DIR="$SCRIPT_DIR/../monitoring"

# ── Pre-flight checks ────────────────────────────────────────────────

if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud is not installed."
  exit 1
fi

gcloud config set project "$GCP_PROJECT"

# Enable required APIs
echo "Enabling Monitoring API..."
gcloud services enable monitoring.googleapis.com

# ── Create notification channel (email) ──────────────────────────────

echo "Creating email notification channel..."
CHANNEL_ID=$(gcloud alpha monitoring channels create \
  --display-name="$SERVICE_NAME alerts" \
  --type=email \
  --channel-labels=email_address="ops@example.com" \
  --format='value(name)' 2>/dev/null || echo "")

if [ -z "$CHANNEL_ID" ]; then
  echo "Warning: Could not create notification channel. Alerts will be created without notifications."
  echo "Update the email address and re-run, or create a channel manually."
fi

# ── Deploy monitoring dashboard ──────────────────────────────────────

echo "Creating Cloud Monitoring dashboard..."
DASHBOARD_JSON=$(sed \
  -e "s/__PROJECT_NAME__/$PROJECT_NAME/g" \
  -e "s/__GCP_PROJECT__/$GCP_PROJECT/g" \
  -e "s/__GCP_REGION__/$GCP_REGION/g" \
  "$MONITORING_DIR/dashboard.json")

echo "$DASHBOARD_JSON" | gcloud monitoring dashboards create --config-from-file=-

# ── Deploy alert policies ────────────────────────────────────────────

echo "Creating alert policies..."
ALERTS_JSON=$(sed \
  -e "s/__PROJECT_NAME__/$PROJECT_NAME/g" \
  -e "s/__GCP_PROJECT__/$GCP_PROJECT/g" \
  -e "s/__GCP_REGION__/$GCP_REGION/g" \
  "$MONITORING_DIR/alerts.json")

echo "$ALERTS_JSON" | gcloud alpha monitoring policies create --policy-from-file=-

echo ""
echo "Monitoring setup complete."
echo "View dashboard: https://console.cloud.google.com/monitoring/dashboards?project=$GCP_PROJECT"
