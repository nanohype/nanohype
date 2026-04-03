# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) -- `npm i -g wrangler`

### First-time setup

```bash
# Authenticate with Cloudflare
wrangler login

# Start local development server
wrangler dev
```

### Deploy

```bash
# Deploy to staging
./scripts/deploy.sh

# Deploy to production
./scripts/deploy.sh production

# Or deploy directly with wrangler
wrangler deploy --env staging
wrangler deploy --env production
```

## Bindings

### R2 Object Storage

To enable R2 storage:

1. Create the bucket:
   ```bash
   wrangler r2 bucket create __PROJECT_NAME__-storage
   ```

2. Uncomment the `[[r2_buckets]]` section in `wrangler.toml`

3. Uncomment the `BUCKET: R2Bucket` binding in `src/index.ts`

### D1 Database

To enable D1:

1. Create the database:
   ```bash
   wrangler d1 create __PROJECT_NAME__-db
   ```

2. Copy the `database_id` from the output into `wrangler.toml`

3. Uncomment the `[[d1_databases]]` section in `wrangler.toml`

4. Uncomment the `DB: D1Database` binding in `src/index.ts`

## Architecture

```
wrangler.toml               # Worker config with name, route, bindings
src/
  index.ts                  # Fetch handler entry point with routing
scripts/
  deploy.sh                 # Deploy with environment selection
.github/
  workflows/
    deploy.yml              # CI/CD preview (staging) + production
```

The Worker runs on Cloudflare's edge network. Incoming requests hit the
`fetch` handler in `src/index.ts`, which routes by pathname:

- `GET /health` -- health check
- `GET /api/status` -- status with edge region
- `*` -- default JSON response

## Useful Commands

| Command | Description |
|---|---|
| `wrangler dev` | Start local dev server |
| `wrangler deploy` | Deploy to default environment |
| `wrangler deploy --env production` | Deploy to production |
| `wrangler tail` | Stream live logs |
| `wrangler secret put <KEY>` | Set a secret |
| `wrangler r2 bucket list` | List R2 buckets |
| `wrangler d1 list` | List D1 databases |

## Production Readiness

- [ ] Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets
- [ ] Configure a custom route or domain in `wrangler.toml`
- [ ] Enable R2/D1 bindings if needed (see Bindings section above)
- [ ] Set Worker secrets via `wrangler secret put` for API keys and credentials
- [ ] Configure rate limiting on the Cloudflare dashboard
- [ ] Enable Workers Analytics for traffic and error monitoring
- [ ] Set up custom error pages for 4xx/5xx responses
- [ ] Configure CORS headers if the Worker serves a frontend
- [ ] Review CPU time limits (10ms free tier, 50ms paid)
- [ ] Test with `wrangler dev --remote` to validate against live bindings

## License

See [LICENSE](LICENSE) for details.
