# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This project deploys to [Vercel](https://vercel.com) with the following configuration:

- **Framework:** __FRAMEWORK__
- **Build command:** `npm run build`
- **API caching:** Disabled (no-store) for all `/api/*` routes

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Vercel CLI](https://vercel.com/docs/cli) -- `npm i -g vercel`

## Getting Started

### First-time setup

```bash
# Authenticate with Vercel
vercel login

# Link to a Vercel project (creates .vercel/project.json)
vercel link
```

### Deploy

```bash
# Preview deploy
./scripts/deploy.sh

# Production deploy
./scripts/deploy.sh production

# Or deploy directly with the CLI
vercel            # preview
vercel --prod     # production
```

### Useful commands

| Command | Description |
|---------|-------------|
| `vercel` | Deploy a preview |
| `vercel --prod` | Deploy to production |
| `vercel env add` | Add an environment variable |
| `vercel env ls` | List environment variables |
| `vercel logs` | Stream deployment logs |
| `vercel domains add` | Add a custom domain |

## Project Structure

```
vercel.json                 # Vercel project configuration
scripts/
  deploy.sh                 # Deploy with pre-flight checks
.github/
  workflows/
    deploy.yml              # CI/CD preview + production (optional)
```

## Configuration

### Environment Variables

Set secrets via the CLI or dashboard:

```bash
vercel env add DATABASE_URL
vercel env add API_SECRET
```

### Custom Domains

```bash
vercel domains add yourdomain.com
```

### Framework Override

The `vercel.json` uses the `__FRAMEWORK__` preset. Change the `framework` field
to match your project (nextjs, vite, remix, nuxt, etc.).

## Production Readiness

- [ ] Set all required environment variables via `vercel env add` (see `.env.example`)
- [ ] Link to a Vercel project (`vercel link`)
- [ ] Configure a custom domain (`vercel domains add yourdomain.com`)
- [ ] Verify DNS records point to Vercel
- [ ] Enable Vercel Edge Network caching for static assets
- [ ] Set framework preset in `vercel.json` to match your project
- [ ] Configure GitHub integration for automatic preview and production deploys
- [ ] Set production branch in Vercel project settings
- [ ] Enable DDoS protection and rate limiting on the Vercel dashboard
- [ ] Set up Vercel Analytics or Speed Insights for monitoring
