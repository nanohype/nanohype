# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This project deploys to [Fly.io](https://fly.io) with the following configuration:

- **App:** __APP_NAME__
- **Region:** __REGION__
- **Machine size:** __MACHINE_SIZE__
- **Health check:** HTTP GET `/healthz` on port 8080

## Prerequisites

- [flyctl](https://fly.io/docs/flyctl/install/) -- Fly.io CLI

## Getting Started

### First-time setup

```bash
# Authenticate with Fly.io
flyctl auth login

# Create the app (if not already created)
flyctl apps create __APP_NAME__
```

### Deploy

```bash
# Deploy using the script
./scripts/deploy.sh

# Or deploy directly
flyctl deploy
```

### Useful commands

| Command | Description |
|---------|-------------|
| `flyctl deploy` | Deploy the app |
| `flyctl status` | Check app status |
| `flyctl logs` | Stream live logs |
| `flyctl ssh console` | SSH into a running machine |
| `flyctl secrets set KEY=value` | Set environment variables |
| `flyctl scale count 2` | Scale to 2 machines |

## Project Structure

```
fly.toml                # Fly.io app configuration
Dockerfile              # Multi-stage container build
scripts/
  deploy.sh             # Deploy with pre-flight checks
  setup-db.sh           # Provision Fly Postgres (optional)
  setup-redis.sh        # Provision Fly Redis (optional)
.github/
  workflows/
    deploy.yml          # CI/CD deploy on push to main (optional)
```

## Configuration

### Environment Variables

Set secrets on Fly.io:

```bash
flyctl secrets set DATABASE_URL="postgres://..." --app __APP_NAME__
```

### Scaling

```bash
# Scale VM size
flyctl scale vm shared-cpu-2x --app __APP_NAME__

# Scale to multiple regions
flyctl scale count 2 --region __REGION__,ord --app __APP_NAME__
```

### Custom domains

```bash
flyctl certs add yourdomain.com --app __APP_NAME__
```
