# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This project deploys to [Google Cloud Run](https://cloud.google.com/run) with the following configuration:

- **GCP Project:** __GCP_PROJECT__
- **Region:** __GCP_REGION__
- **Platform:** Cloud Run (fully managed)
- **Health check:** HTTP GET `/healthz` on port 8080

## Prerequisites

- [gcloud](https://cloud.google.com/sdk/docs/install) -- Google Cloud CLI

## Getting Started

### First-time setup

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set the active project
gcloud config set project __GCP_PROJECT__

# Enable required APIs
gcloud services enable run.googleapis.com containerregistry.googleapis.com cloudbuild.googleapis.com
```

### Deploy

```bash
# Deploy using the script
./scripts/deploy.sh

# Or deploy directly
gcloud builds submit --tag gcr.io/__GCP_PROJECT__/__PROJECT_NAME__
gcloud run deploy __PROJECT_NAME__ \
  --image gcr.io/__GCP_PROJECT__/__PROJECT_NAME__ \
  --region __GCP_REGION__ \
  --platform managed
```

### Useful commands

| Command | Description |
|---------|-------------|
| `gcloud run services list` | List Cloud Run services |
| `gcloud run services describe __PROJECT_NAME__ --region __GCP_REGION__` | Service details |
| `gcloud logging read "resource.type=cloud_run_revision"` | Read service logs |
| `gcloud run services update __PROJECT_NAME__ --set-env-vars=KEY=value` | Set environment variables |
| `gcloud run services update __PROJECT_NAME__ --max-instances=20` | Scale max instances |

## Project Structure

```
Dockerfile              # Multi-stage container build
scripts/
  deploy.sh             # Deploy with pre-flight checks
  setup-db.sh           # Provision Cloud SQL PostgreSQL (optional)
  setup-monitoring.sh   # Deploy monitoring dashboard and alerts (optional)
monitoring/
  dashboard.json        # Cloud Monitoring dashboard definition (optional)
  alerts.json           # Alert policy definitions (optional)
.github/
  workflows/
    deploy.yml          # CI/CD deploy on push to main (optional)
```

## Configuration

### Environment Variables

Set environment variables on Cloud Run:

```bash
gcloud run services update __PROJECT_NAME__ \
  --region __GCP_REGION__ \
  --set-env-vars="DATABASE_URL=postgres://..."
```

### Custom Domains

```bash
gcloud run domain-mappings create \
  --service __PROJECT_NAME__ \
  --domain yourdomain.com \
  --region __GCP_REGION__
```
