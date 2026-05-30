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

# OTel auto-instrumentation — traces http/fetch/aws-sdk and wires a MeterProvider
# before user code, exporting to the cluster collector. Requires
# @opentelemetry/auto-instrumentations-node in production deps.
ENV NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
ENV OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector.observability.svc.cluster.local:4318"
ENV OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
