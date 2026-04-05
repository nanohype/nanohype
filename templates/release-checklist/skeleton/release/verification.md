# Deployment Verification: __PROJECT_NAME__

**Release Type:** __RELEASE_TYPE__
**Environment:** Production
**Deployed At:** YYYY-MM-DD HH:MM UTC

---

## Smoke Tests

Verify core functionality immediately after deployment. Each test should complete within 2 minutes. If any critical smoke test fails, initiate the rollback procedure.

### Health and Infrastructure

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Health endpoint (`GET /health`) | 200 OK, all checks pass | [ ] | |
| Version endpoint (`GET /version`) | Returns expected version string | [ ] | |
| Application logs streaming | Logs visible in monitoring tool, no error spikes | [ ] | |
| CPU and memory metrics | Within normal operating range | [ ] | |
| Database connectivity | Queries executing, connection pool healthy | [ ] | |

### Authentication and Authorization

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Login with valid credentials | Successful authentication, session created | [ ] | |
| Access protected endpoint without auth | 401 Unauthorized returned | [ ] | |
| Role-based access control | Restricted endpoints enforce correct roles | [ ] | |
| Session expiry | Expired sessions redirect to login | [ ] | |

### Core Workflows

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Primary user workflow (end-to-end) | Completes successfully, data persisted | [ ] | |
| Search functionality | Returns relevant results within SLA | [ ] | |
| Data creation | New records created and visible in list | [ ] | |
| Data modification | Edits persisted and reflected in UI | [ ] | |
| Notification delivery | Triggered notifications arrive at destination | [ ] | |

### External Integrations

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Payment processor connectivity | Test transaction succeeds | [ ] | |
| Email delivery | Test email received at destination | [ ] | |
| Third-party API calls | Requests succeed, responses valid | [ ] | |
| Webhook delivery | Outbound webhooks received by consumer | [ ] | |

---

## Performance Validation

Compare key metrics against the pre-deployment baseline. Flag any degradation exceeding the threshold.

| Metric | Baseline | Current | Threshold | Status |
|---|---|---|---|---|
| P50 response time | ms | ms | < 200ms | [ ] |
| P95 response time | ms | ms | < 500ms | [ ] |
| P99 response time | ms | ms | < 1000ms | [ ] |
| Error rate (5xx) | % | % | < 0.1% | [ ] |
| Error rate (4xx, non-auth) | % | % | < 1.0% | [ ] |
| Database query time (P95) | ms | ms | < 100ms | [ ] |
| Memory usage | MB | MB | < 80% of limit | [ ] |
| CPU usage | % | % | < 70% of limit | [ ] |

---

## Monitoring Confirmation

Verify that monitoring and alerting is functioning correctly for the new deployment.

### Dashboards

- [ ] Application dashboard loading with current data
- [ ] Error rate dashboard showing post-deployment data
- [ ] Performance dashboard showing response time metrics
- [ ] Infrastructure dashboard showing resource utilization

### Alerts

- [ ] Error rate alert configured and active
- [ ] Latency alert configured and active
- [ ] Resource utilization alerts configured and active
- [ ] On-call rotation confirmed and reachable

### Logging

- [ ] Application logs flowing to log aggregator
- [ ] Log level set to appropriate production level
- [ ] No sensitive data appearing in log output
- [ ] Structured log fields present (request ID, user ID, etc.)

---

## Extended Monitoring Period

Monitor for the duration appropriate to the release type:

- **Major release:** 48 hours
- **Minor release:** 24 hours
- **Patch release:** 4 hours

### Monitoring Checkpoints

| Time After Deploy | Checked By | Status | Notes |
|---|---|---|---|
| +30 minutes | | [ ] | |
| +2 hours | | [ ] | |
| +6 hours | | [ ] | |
| +12 hours | | [ ] | |
| +24 hours | | [ ] | |
| +48 hours (major only) | | [ ] | |

---

## Verification Outcome

- [ ] **PASS** — All smoke tests pass, performance within thresholds, monitoring confirmed
- [ ] **CONDITIONAL PASS** — Minor issues noted, monitoring extended, no user impact
- [ ] **FAIL** — Critical issue detected, rollback initiated

**Verified By:** [Name]
**Verified At:** YYYY-MM-DD HH:MM UTC
**Notes:**
