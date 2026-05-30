# ── Build Stage ───────────────────────────────────────────────────────

FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Production Stage ──────────────────────────────────────────────────

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER node

# Batch ETL entry. In-cluster this typically runs as a CronJob/Job.
CMD ["node", "dist/pipeline/index.js"]
