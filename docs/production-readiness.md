# Production Readiness

Canonical checklist for deploying nanohype-scaffolded projects. The items below are cumulative -- AI services inherit all base service requirements, and infrastructure deployments add their own layer on top.

---

## Every deployed service

These apply to any HTTP service, worker, or long-running process hitting production.

### Configuration and secrets

- [ ] All environment variables configured (see the project's `.env.example`)
- [ ] Secrets stored in a secrets manager (AWS Secrets Manager, Vault, Doppler) -- never committed to `.env` files or source control
- [ ] Default placeholder values replaced -- most templates include Zod config validation that rejects unsubstituted placeholders at startup

### Network and request handling

- [ ] CORS restricted to specific allowed origins -- never deploy with `CORS_ORIGIN=*`
- [ ] Rate limiting configured per endpoint, with stricter limits on authentication and mutation routes
- [ ] Request body size limits set (templates default to 1 MB -- tune for your workload)
- [ ] Request ID correlation enabled -- propagate a `X-Request-Id` header through all downstream calls for distributed tracing
- [ ] TLS termination configured at the load balancer or reverse proxy

### Health and lifecycle

- [ ] Health check endpoint (`/health`) monitored by the load balancer -- returns 200 when the process is alive
- [ ] Readiness probe (`/readyz`) connected to the orchestrator (Kubernetes, ECS, Fly) -- returns 200 only when the service can accept traffic (database connected, caches warm)
- [ ] Graceful shutdown handlers registered for `SIGTERM` and `SIGINT` -- drain in-flight requests, close database pools, flush telemetry buffers
- [ ] Shutdown timeout matches your load balancer's drain period -- if the LB waits 30 seconds, the process should wait at least that long before force-exiting

### Observability

- [ ] Structured JSON logging with `LOG_LEVEL=warn` (or `info` if you need request logs)
- [ ] OpenTelemetry export configured (`OTEL_EXPORTER_OTLP_ENDPOINT`) for distributed traces and metrics
- [ ] Error tracking and alerting configured -- alert on error rate spikes and p99 latency regressions
- [ ] Load test baseline established -- know your service's throughput and latency profile before it takes real traffic

---

## Every AI service additionally

On top of the base service checklist, any service that calls LLM providers needs these items.

### API key and cost management

- [ ] LLM API keys rotated on a schedule -- treat them like database passwords, not permanent credentials
- [ ] Cost tracking enabled with budget alerts -- a runaway loop can burn through thousands of dollars in minutes
- [ ] Token usage monitored and reported -- track input tokens, output tokens, and total cost per request and per user

### Reliability

- [ ] Fallback provider configured in the LLM gateway (`module-llm-gateway`) -- if your primary provider is down, traffic routes to the secondary
- [ ] Circuit breakers on all provider calls -- stop hammering a failing provider and fail fast instead of queueing timeouts
- [ ] Mock provider available for testing without API keys -- every template's provider registry supports a mock or in-memory backend

### Quality and caching

- [ ] Eval suite running in CI (`eval-harness` or `ci-eval` template) -- catch regressions in agent behavior before they ship
- [ ] Response caching evaluated -- consider content-hash deduplication, sliding-TTL caches, or semantic caching (`module-semantic-cache`) depending on your latency and freshness requirements

---

## Every infrastructure deployment

For the IaC layer -- Terraform/OpenTofu modules, Kubernetes manifests, Helm charts, CDK stacks.

### Data protection

- [ ] Encryption at rest enabled for all storage (RDS, S3, EBS volumes, Redis persistence)
- [ ] Automated backups configured with a retention policy that matches your RPO (recovery point objective)
- [ ] Secrets rotation automated -- database passwords, API keys, and TLS certificates should rotate without manual intervention

### Monitoring and alerting

- [ ] Monitoring dashboards deployed (`monitoring-stack` template provides Prometheus, Grafana, and Loki)
- [ ] Alert rules configured for resource exhaustion -- CPU, memory, disk, and connection pool saturation
- [ ] Disaster recovery plan documented and tested -- know your RTO (recovery time objective) and validate it with periodic drills

### Network security

- [ ] Network policies or security groups restricted to least-privilege -- services should only reach the endpoints they need
- [ ] Ingress limited to known CIDR ranges or behind a VPN for internal services
- [ ] Egress filtered where possible -- prevent compromised workloads from phoning home to arbitrary destinations
