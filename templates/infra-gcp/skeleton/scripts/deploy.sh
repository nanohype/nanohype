#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="__PROJECT_NAME__"
GCP_PROJECT="__GCP_PROJECT__"
GCP_REGION="__GCP_REGION__"
SERVICE_NAME="$PROJECT_NAME"
IMAGE="gcr.io/$GCP_PROJECT/$SERVICE_NAME"

# ── Pre-deploy checks ────────────────────────────────────────────────

if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud is not installed. Install from https://cloud.google.com/sdk/docs/install"
  exit 1
fi

if ! gcloud auth print-identity-token &>/dev/null; then
  echo "Error: Not authenticated with GCP. Run: gcloud auth login"
  exit 1
fi

# Set the active project
gcloud config set project "$GCP_PROJECT"

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com

# ── Build and push ───────────────────────────────────────────────────

echo "Building container image..."
gcloud builds submit \
  --tag "$IMAGE" \
  --project "$GCP_PROJECT"

# ── Deploy to Cloud Run ──────────────────────────────────────────────

echo "Deploying $SERVICE_NAME to Cloud Run in $GCP_REGION..."
# NOTE: By default, the service requires authentication (IAM invoker permission).
# To allow public access during development, add: --allow-unauthenticated
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --platform managed \
  --port 8080 \
  --no-allow-unauthenticated \
  --set-env-vars="PROJECT_NAME=$PROJECT_NAME" \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300

# ── Print service URL ────────────────────────────────────────────────

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$GCP_REGION" \
  --format='value(status.url)')

echo ""
echo "Deploy complete."
echo "Service URL: $SERVICE_URL"
