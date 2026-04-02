#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="__PROJECT_NAME__"
GCP_PROJECT="__GCP_PROJECT__"
GCP_REGION="__GCP_REGION__"
INSTANCE_NAME="${PROJECT_NAME}-db"
DB_NAME="$PROJECT_NAME"
DB_USER="$PROJECT_NAME"

# ── Pre-flight checks ────────────────────────────────────────────────

if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud is not installed."
  exit 1
fi

gcloud config set project "$GCP_PROJECT"

# Enable required APIs
echo "Enabling Cloud SQL API..."
gcloud services enable sqladmin.googleapis.com

# ── Create Cloud SQL instance ────────────────────────────────────────

echo "Creating Cloud SQL PostgreSQL instance '$INSTANCE_NAME' in $GCP_REGION..."
gcloud sql instances create "$INSTANCE_NAME" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$GCP_REGION" \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --availability-type=zonal

# ── Create database and user ─────────────────────────────────────────

echo "Creating database '$DB_NAME'..."
gcloud sql databases create "$DB_NAME" \
  --instance="$INSTANCE_NAME"

DB_PASSWORD=$(openssl rand -base64 24)

echo "Creating user '$DB_USER'..."
gcloud sql users create "$DB_USER" \
  --instance="$INSTANCE_NAME" \
  --password="$DB_PASSWORD"

# ── Connect Cloud Run to Cloud SQL ───────────────────────────────────

SERVICE_NAME="$PROJECT_NAME"
CONNECTION_NAME=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --format='value(connectionName)')

echo "Updating Cloud Run service with Cloud SQL connection..."
gcloud run services update "$SERVICE_NAME" \
  --region="$GCP_REGION" \
  --add-cloudsql-instances="$CONNECTION_NAME" \
  --set-env-vars="DB_HOST=/cloudsql/$CONNECTION_NAME,DB_NAME=$DB_NAME,DB_USER=$DB_USER"

echo ""
echo "Cloud SQL PostgreSQL is ready."
echo "Instance:   $INSTANCE_NAME"
echo "Database:   $DB_NAME"
echo "User:       $DB_USER"
echo "Connection: $CONNECTION_NAME"
echo ""
echo "IMPORTANT: Store the database password securely."
echo "Password:   $DB_PASSWORD"
echo ""
echo "Set the password as a Cloud Run secret:"
echo "  gcloud run services update $SERVICE_NAME --region=$GCP_REGION --set-env-vars=DB_PASSWORD=$DB_PASSWORD"
