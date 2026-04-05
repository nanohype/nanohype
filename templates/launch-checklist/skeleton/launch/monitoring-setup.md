# __PROJECT_NAME__ — Monitoring Setup

**Launch type:** __LAUNCH_TYPE__
**Last updated:** YYYY-MM-DD

---

## Pre-Launch Baseline

Capture baseline metrics at least 7 days before launch. These baselines define "normal" and are used to detect launch-related regressions.

| Metric | Baseline Value | Measurement Window | Source |
|---|---|---|---|
| Error rate (5xx) | _e.g., 0.05%_ | 7-day average | _Monitoring tool_ |
| P50 latency | _e.g., 45ms_ | 7-day average | _Monitoring tool_ |
| P99 latency | _e.g., 180ms_ | 7-day average | _Monitoring tool_ |
| Requests per second | _e.g., 500 rps_ | 7-day peak | _Monitoring tool_ |
| CPU utilization | _e.g., 35%_ | 7-day p95 | _Infrastructure dashboard_ |
| Memory utilization | _e.g., 60%_ | 7-day p95 | _Infrastructure dashboard_ |
| Database query time (p95) | _e.g., 25ms_ | 7-day average | _Database dashboard_ |

---

## Launch Dashboard

Create a dedicated launch dashboard with the following panels. Keep this dashboard bookmarked in the incident channel for the first 48 hours.

### Application Health

| Panel | Query / Metric | Visualization |
|---|---|---|
| Request rate | `rate(http_requests_total{app="__PROJECT_NAME__"}[5m])` | Time series |
| Error rate | `rate(http_requests_total{app="__PROJECT_NAME__", status=~"5.."}[5m]) / rate(http_requests_total{app="__PROJECT_NAME__"}[5m])` | Time series with threshold line |
| Latency distribution | `histogram_quantile(0.5, rate(http_request_duration_seconds_bucket{app="__PROJECT_NAME__"}[5m]))` for p50, p90, p99 | Time series (stacked quantiles) |
| Active connections | `sum(http_connections_active{app="__PROJECT_NAME__"})` | Gauge |

### Infrastructure

| Panel | Query / Metric | Visualization |
|---|---|---|
| CPU utilization | `avg(cpu_usage_percent{app="__PROJECT_NAME__"})` by instance | Time series |
| Memory utilization | `avg(memory_usage_bytes{app="__PROJECT_NAME__"}) / avg(memory_limit_bytes{app="__PROJECT_NAME__"})` | Time series with threshold |
| Instance count | `count(up{app="__PROJECT_NAME__"} == 1)` | Stat panel |
| Disk usage | `disk_usage_percent{app="__PROJECT_NAME__"}` | Gauge with thresholds |

### Business Metrics

| Panel | Query / Metric | Visualization |
|---|---|---|
| Feature adoption | Custom event: `feature_used{feature="__PROJECT_NAME__"}` | Time series |
| Conversion funnel | Custom events for each funnel step | Bar chart |
| User errors | `count(user_error_total{app="__PROJECT_NAME__"})` by error type | Stacked bar |

---

## Alert Configuration

### Critical Alerts (Page on-call immediately)

| Alert | Condition | Duration | Severity | Action |
|---|---|---|---|---|
| High error rate | Error rate > 1% (20x baseline) | 5 minutes | P1 | Page on-call, create incident channel |
| Health check failure | `/ready` returns non-200 on > 50% of instances | 2 minutes | P1 | Page on-call, check infrastructure |
| Complete service outage | All instances returning 5xx or unreachable | 1 minute | P1 | Page on-call + engineering manager |

### Warning Alerts (Notify on-call, no page outside business hours)

| Alert | Condition | Duration | Severity | Action |
|---|---|---|---|---|
| Elevated error rate | Error rate > 0.5% (10x baseline) | 10 minutes | P2 | Notify on-call via Slack |
| High latency | P99 latency > 2x baseline | 10 minutes | P2 | Notify on-call, check dependencies |
| CPU saturation | CPU utilization > 80% | 15 minutes | P2 | Notify on-call, consider scaling |
| Memory pressure | Memory utilization > 85% | 15 minutes | P2 | Notify on-call, check for leaks |

### Informational Alerts (Log and notify team channel)

| Alert | Condition | Duration | Severity | Action |
|---|---|---|---|---|
| Traffic spike | Request rate > 2x baseline | 15 minutes | P3 | Post in team channel |
| Database slow queries | Query p95 > 2x baseline | 15 minutes | P3 | Post in team channel |
| Disk usage warning | Disk usage > 70% | 30 minutes | P3 | Post in team channel |
| Dependency degradation | Upstream error rate elevated | 10 minutes | P3 | Post in team channel |

---

## Monitoring Checklist

Verify each item before the go/no-go decision:

| # | Item | Status | Owner |
|---|---|---|---|
| 1 | Launch dashboard created and accessible to on-call team | [ ] | _SRE_ |
| 2 | All critical alerts configured and routed to on-call rotation | [ ] | _SRE_ |
| 3 | Warning alerts configured and routed to team channel | [ ] | _SRE_ |
| 4 | Baseline metrics captured and documented (see table above) | [ ] | _SRE_ |
| 5 | Alert thresholds reviewed by engineering lead | [ ] | _Eng lead_ |
| 6 | On-call team has dashboard bookmarked and access verified | [ ] | _SRE_ |
| 7 | Business metrics events verified in staging environment | [ ] | _PM_ |
| 8 | Log aggregation confirmed — launch-specific logs searchable | [ ] | _SRE_ |
| 9 | Synthetic monitoring / health checks configured for external probing | [ ] | _SRE_ |

---

## Post-Launch Monitoring Schedule

| Window | Monitoring Level | Check Frequency | Responsible |
|---|---|---|---|
| 0-2 hours | Active watch | Continuous | On-call primary |
| 2-8 hours | Elevated attention | Every 30 minutes | On-call primary |
| 8-24 hours | Standard + dashboard checks | Every 2 hours | On-call rotation |
| 24-48 hours | Standard + daily review | Every 4 hours | On-call rotation |
| 48 hours - 1 week | Standard | Normal alert-driven | On-call rotation |
| 1 week+ | Steady state | Normal operations | On-call rotation |
