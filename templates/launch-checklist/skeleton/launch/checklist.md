# __PROJECT_NAME__ — Launch Checklist

**Launch type:** __LAUNCH_TYPE__
**Target date:** YYYY-MM-DD
**Last updated:** YYYY-MM-DD

---

## Launch Summary

| Attribute | Value |
|---|---|
| Project | __PROJECT_NAME__ |
| Launch type | __LAUNCH_TYPE__ |
| Launch owner | _Name_ |
| Target date | YYYY-MM-DD |
| Go/no-go decision date | YYYY-MM-DD |
| Rollback deadline | _Last date a rollback is feasible_ |

---

## Go/No-Go Criteria

Each functional area must sign off before launch proceeds. A single "no-go" blocks the launch unless the launch owner grants a documented exception with a mitigation plan.

### Engineering

| # | Criterion | Status | Owner | Notes |
|---|---|---|---|---|
| E1 | All launch-blocking bugs resolved or mitigated | [ ] | _Eng lead_ | |
| E2 | Load testing completed at 2x expected peak traffic | [ ] | _Eng lead_ | |
| E3 | Database migrations tested in staging and rollback verified | [ ] | _Eng lead_ | |
| E4 | API versioning strategy confirmed — no breaking changes to existing consumers | [ ] | _Eng lead_ | |
| E5 | Feature flags configured for gradual rollout | [ ] | _Eng lead_ | |
| E6 | Error handling and graceful degradation verified | [ ] | _Eng lead_ | |
| E7 | Deployment pipeline tested end-to-end (build, test, deploy, verify) | [ ] | _Eng lead_ | |

### Product

| # | Criterion | Status | Owner | Notes |
|---|---|---|---|---|
| P1 | PRD accepted and all in-scope features complete | [ ] | _PM_ | |
| P2 | User acceptance testing completed by stakeholder group | [ ] | _PM_ | |
| P3 | Success metrics instrumented and baseline captured | [ ] | _PM_ | |
| P4 | Help documentation and in-app guidance published | [ ] | _PM_ | |
| P5 | Launch tier confirmed — feature scope matches __LAUNCH_TYPE__ expectations | [ ] | _PM_ | |
| P6 | Rollback criteria documented and agreed upon | [ ] | _PM_ | |

### Design

| # | Criterion | Status | Owner | Notes |
|---|---|---|---|---|
| D1 | Final design review completed — all screens match approved mocks | [ ] | _Design lead_ | |
| D2 | Accessibility audit passed (WCAG 2.1 AA minimum) | [ ] | _Design lead_ | |
| D3 | Responsive behavior verified across target breakpoints | [ ] | _Design lead_ | |
| D4 | Empty states, error states, and loading states implemented | [ ] | _Design lead_ | |

### QA

| # | Criterion | Status | Owner | Notes |
|---|---|---|---|---|
| Q1 | Test plan executed — all P0 and P1 test cases passing | [ ] | _QA lead_ | |
| Q2 | Regression suite passing with no new failures | [ ] | _QA lead_ | |
| Q3 | Cross-browser and cross-device testing completed | [ ] | _QA lead_ | |
| Q4 | Performance benchmarks met (page load, API response times) | [ ] | _QA lead_ | |
| Q5 | Data migration validation completed (if applicable) | [ ] | _QA lead_ | |

### Security

| # | Criterion | Status | Owner | Notes |
|---|---|---|---|---|
| S1 | Security review completed — no open critical or high findings | [ ] | _Security_ | |
| S2 | Authentication and authorization flows verified | [ ] | _Security_ | |
| S3 | Input validation and output encoding confirmed | [ ] | _Security_ | |
| S4 | Dependency vulnerability scan clean (no critical CVEs) | [ ] | _Security_ | |
| S5 | Data handling compliant with privacy requirements | [ ] | _Security_ | |

### Legal and Compliance

| # | Criterion | Status | Owner | Notes |
|---|---|---|---|---|
| L1 | Terms of service updated if feature changes user agreements | [ ] | _Legal_ | |
| L2 | Privacy policy reviewed for new data collection | [ ] | _Legal_ | |
| L3 | Regulatory requirements met for target markets | [ ] | _Legal_ | |
| L4 | Third-party license compliance verified for new dependencies | [ ] | _Legal_ | |

### Operations

| # | Criterion | Status | Owner | Notes |
|---|---|---|---|---|
| O1 | Monitoring and alerting configured (see `monitoring-setup.md`) | [ ] | _SRE_ | |
| O2 | Runbook updated with new service procedures | [ ] | _SRE_ | |
| O3 | On-call team briefed on launch scope and known risks | [ ] | _SRE_ | |
| O4 | Rollback procedure documented and tested in staging | [ ] | _SRE_ | |
| O5 | Capacity planning validated — infrastructure provisioned for expected load | [ ] | _SRE_ | |
| O6 | Incident communication channels and escalation paths confirmed | [ ] | _SRE_ | |

---

## Rollback Plan

### Rollback Triggers

Initiate rollback if any of the following occur within the first 48 hours post-launch:

- Error rate exceeds 2x pre-launch baseline for > 10 minutes
- P99 latency exceeds 3x pre-launch baseline for > 10 minutes
- Customer-reported data integrity issue confirmed
- Security vulnerability discovered in launch-specific code
- Revenue-impacting bug confirmed (payments, billing, subscriptions)

### Rollback Procedure

1. Launch owner announces rollback decision in incident channel
2. Engineering executes rollback using the tested procedure
3. Verify all health checks pass and metrics return to pre-launch baseline
4. Product notifies stakeholders via the pre-agreed channels
5. File a post-launch incident report within 24 hours

### Rollback Deadline

After YYYY-MM-DD, data migrations or user-facing changes make a clean rollback infeasible. Beyond this date, issues must be fixed forward.

---

## Go/No-Go Decision

| Decision | Date | Decided by | Rationale |
|---|---|---|---|
| _GO / NO-GO_ | YYYY-MM-DD | _Launch owner_ | _Summary of rationale_ |

### Exceptions Granted

| Criterion | Exception | Mitigation | Approved by |
|---|---|---|---|
| _e.g., E2 — Load test at 1.5x instead of 2x_ | _Infrastructure delivery delayed_ | _Auto-scaling configured, manual monitoring during peak_ | _Eng director_ |

---

## Post-Launch Verification

Tasks to complete within the first 24 hours after launch:

| # | Task | Status | Owner |
|---|---|---|---|
| 1 | Verify all monitoring dashboards show healthy metrics | [ ] | _SRE_ |
| 2 | Confirm feature flags at intended rollout percentage | [ ] | _Eng lead_ |
| 3 | Check support queue for launch-related tickets | [ ] | _Support_ |
| 4 | Validate success metrics data is flowing correctly | [ ] | _PM_ |
| 5 | Send launch confirmation to stakeholder list | [ ] | _PM_ |
| 6 | Schedule post-launch retrospective (within 1 week) | [ ] | _PM_ |
