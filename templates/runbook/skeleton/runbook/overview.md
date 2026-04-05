# __SERVICE_NAME__ — Service Overview

**Project:** __PROJECT_NAME__
**On-call tool:** __ON_CALL_TOOL__
**Last updated:** YYYY-MM-DD

---

## Service Summary

| Attribute | Value |
|---|---|
| Service name | __SERVICE_NAME__ |
| Team owner | _Team name_ |
| On-call rotation | __ON_CALL_TOOL__ schedule: `__PROJECT_NAME__-primary` |
| Tier | _Tier 1 / Tier 2 / Tier 3_ |
| SLA | _99.9% availability, <200ms p99 latency_ |
| Repository | _Link to source repository_ |
| Dashboard | _Link to monitoring dashboard_ |
| Runbook location | _Link to this document_ |

---

## Architecture

### What This Service Does

Describe the service's purpose in 2-3 sentences. What business function does it serve? What does it do at a high level?

### How It Works

Describe the service's internal architecture. Cover:

- **Runtime:** Language, framework, and runtime version
- **Data stores:** Databases, caches, queues used
- **External APIs:** Third-party services called
- **Internal APIs:** Other services that depend on or are depended upon
- **Processing model:** Request/response, event-driven, batch, streaming

### Architecture Diagram

```
                    ┌─────────────┐
                    │  API Gateway │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  __SERVICE_NAME__  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌──────▼──────┐
       │  PostgreSQL  │ │ Redis │ │  Queue (SQS) │
       └─────────────┘ └──────┘ └─────────────┘
```

---

## Deployment

### Deployment Method

Describe how the service is deployed (CI/CD pipeline, container orchestration, serverless, etc.).

| Attribute | Value |
|---|---|
| Deployment target | _e.g., ECS, Kubernetes, Lambda_ |
| Container image | _Registry URL and tag pattern_ |
| Deploy pipeline | _Link to CI/CD pipeline_ |
| Deploy cadence | _e.g., Continuous, daily, manual_ |
| Rollback method | _e.g., Revert container tag, feature flag_ |

### Environment Configuration

| Environment | URL | Purpose |
|---|---|---|
| Production | `https://prod.__PROJECT_NAME__.example.com` | Live traffic |
| Staging | `https://staging.__PROJECT_NAME__.example.com` | Pre-production validation |
| Development | `https://dev.__PROJECT_NAME__.example.com` | Active development |

### Health Endpoints

| Endpoint | Purpose | Expected Response |
|---|---|---|
| `GET /health` | Liveness check — is the process running? | `200 OK` with `{"status": "ok"}` |
| `GET /ready` | Readiness check — can it serve traffic? | `200 OK` when all dependencies reachable |
| `GET /metrics` | Prometheus-format metrics | Metrics payload |

---

## Ownership

### Team Contacts

| Role | Name | Contact |
|---|---|---|
| Team lead | _Name_ | _Slack / email_ |
| Tech lead | _Name_ | _Slack / email_ |
| On-call primary | _Rotation_ | __ON_CALL_TOOL__: `__PROJECT_NAME__-primary` |
| On-call secondary | _Rotation_ | __ON_CALL_TOOL__: `__PROJECT_NAME__-secondary` |

### Stakeholders

| Stakeholder | Interest | Communication |
|---|---|---|
| _Product team_ | Feature changes and availability | _Slack channel_ |
| _Platform team_ | Infrastructure and dependency changes | _Slack channel_ |
| _Support team_ | Customer-facing issues | _Slack channel_ |

---

## Key Metrics

### SLIs (Service Level Indicators)

| SLI | Target | Measurement |
|---|---|---|
| Availability | 99.9% | `1 - (error_requests / total_requests)` over 30-day window |
| Latency (p50) | < 50ms | Request duration histogram |
| Latency (p99) | < 200ms | Request duration histogram |
| Error rate | < 0.1% | `5xx_responses / total_responses` |

### Alerts

| Alert | Severity | Condition | Runbook Section |
|---|---|---|---|
| High error rate | P1 | Error rate > 1% for 5 min | See `procedures.md` |
| High latency | P2 | P99 latency > 500ms for 10 min | See `procedures.md` |
| Health check failure | P1 | `/ready` returns non-200 for 2 min | See `procedures.md` |
| Disk usage | P3 | Disk usage > 80% | See `procedures.md` |
