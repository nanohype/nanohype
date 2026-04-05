# __PROJECT_NAME__ — Change Request

**Change ID:** CHG-XXXX
**Change type:** __CHANGE_TYPE__
**Requested by:** _Name_
**Date submitted:** YYYY-MM-DD
**Target implementation date:** YYYY-MM-DD
**Last updated:** YYYY-MM-DD

---

## Change Summary

| Attribute | Value |
|---|---|
| Change ID | CHG-XXXX |
| Change type | __CHANGE_TYPE__ |
| Priority | _Critical / High / Medium / Low_ |
| Affected service(s) | __PROJECT_NAME__ |
| Environment | _Production / Staging / All_ |
| Implementation window | _YYYY-MM-DD HH:MM to HH:MM UTC_ |
| Estimated duration | _e.g., 30 minutes_ |
| Requires downtime | _Yes / No_ |
| Requires maintenance window | _Yes / No_ |

---

## Description

### What Is Being Changed

Describe the change in specific technical terms. Include what will be modified, added, or removed.

> _Example: Upgrade PostgreSQL from 14.8 to 15.4 on the __PROJECT_NAME__ production database cluster. This involves a rolling upgrade of the replica set followed by a primary failover._

### Why This Change Is Needed

Explain the business or technical motivation. Reference any related incidents, security advisories, or feature requirements.

> _Example: PostgreSQL 14 reaches end-of-life in November 2025. Version 15.4 includes security patches for CVE-2024-XXXX and performance improvements for the query patterns used by __PROJECT_NAME__._

### What Happens If This Change Is Not Made

Describe the risk of inaction. This helps approvers weigh the change risk against the risk of doing nothing.

> _Example: Running an unsupported database version exposes __PROJECT_NAME__ to unpatched security vulnerabilities and blocks adoption of query performance features needed for the Q1 traffic projection._

---

## Scope

### In Scope

- Specific component, service, or infrastructure being changed
- Configuration changes included
- Data migrations included (if any)

### Out of Scope

- Related changes explicitly excluded from this request
- Dependent changes that will be handled separately

### Affected Systems

| System | Relationship | Impact |
|---|---|---|
| __PROJECT_NAME__ application | Direct | Brief connection interruption during primary failover |
| _Dependent service A_ | Downstream consumer | May experience transient errors during failover window |
| _Monitoring system_ | Observer | Alert suppression required during maintenance window |

See `impact-assessment.yaml` for the detailed impact analysis.

---

## Risk Assessment

### Risk Level

| Factor | Rating | Justification |
|---|---|---|
| Complexity | _Low / Medium / High_ | _e.g., Standard upgrade procedure with established runbook_ |
| Blast radius | _Low / Medium / High_ | _e.g., Affects single service, but it is tier-1_ |
| Reversibility | _Easy / Moderate / Difficult_ | _e.g., Rollback requires restoring from backup (30 min)_ |
| Data impact | _None / Low / Medium / High_ | _e.g., No data format changes; data preserved through upgrade_ |
| Overall risk | _Low / Medium / High / Critical_ | _Composite assessment_ |

### What Could Go Wrong

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| _Upgrade fails mid-process_ | Low | High | _Pre-verified upgrade path in staging; backup taken before start_ |
| _Application incompatibility with new version_ | Low | High | _Full test suite run against new version in staging_ |
| _Performance regression_ | Medium | Medium | _Benchmark comparison before and after; rollback if p99 degrades > 20%_ |
| _Extended downtime beyond maintenance window_ | Low | High | _Rollback procedure tested; failover to read replica if primary upgrade stalls_ |

---

## Testing Plan

### Pre-Implementation Testing

| Test | Environment | Status | Result |
|---|---|---|---|
| _Upgrade procedure tested_ | Staging | [ ] | _Pass / Fail / Pending_ |
| _Application test suite against new version_ | Staging | [ ] | _Pass / Fail / Pending_ |
| _Performance benchmark comparison_ | Staging | [ ] | _Pass / Fail / Pending_ |
| _Rollback procedure tested_ | Staging | [ ] | _Pass / Fail / Pending_ |
| _Dependent service compatibility verified_ | Staging | [ ] | _Pass / Fail / Pending_ |

### Post-Implementation Verification

| Check | Expected Result | Owner |
|---|---|---|
| _Health check passing_ | `GET /ready` returns 200 on all instances | _SRE_ |
| _Error rate within baseline_ | Error rate < 0.1% | _SRE_ |
| _Latency within baseline_ | P99 < 200ms | _SRE_ |
| _Database version confirmed_ | `SELECT version()` returns 15.4 | _DBA_ |
| _Replication healthy_ | Replica lag < 1 second | _DBA_ |
| _Application logs clean_ | No new error patterns in first 30 minutes | _Engineer_ |

---

## Implementation Plan

### Pre-Change Steps

1. Notify stakeholders per the approved communication plan
2. Take a full database backup and verify backup integrity
3. Suppress non-critical alerts for __PROJECT_NAME__ during maintenance window
4. Verify rollback procedure and confirm rollback materials are ready
5. Confirm all approvals are in place (see `approval-workflow.yaml`)

### Implementation Steps

1. _Step 1: Describe the first action in specific terms_
2. _Step 2: Describe the next action_
3. _Step 3: Continue with each discrete step_
4. _Step 4: Include verification checks between major steps_
5. _Step 5: Final verification step_

### Post-Change Steps

1. Re-enable suppressed alerts
2. Run post-implementation verification checks (see table above)
3. Monitor dashboards for 30 minutes
4. Notify stakeholders of successful completion
5. Update change record with actual implementation time and results

---

## Communication Plan

| Timing | Audience | Channel | Message |
|---|---|---|---|
| T-24 hours | Operations team | #ops Slack channel | Maintenance window announcement with scope and expected impact |
| T-1 hour | On-call team | On-call handoff | Confirm awareness, share this change request document |
| T-0 (start) | Operations team | #ops Slack channel | "Change CHG-XXXX implementation starting" |
| During | Incident channel (if created) | #chg-XXXX | Real-time progress updates |
| Completion | Operations team | #ops Slack channel | "Change CHG-XXXX completed successfully" or rollback notice |
| T+24 hours | Stakeholders | Email | Post-change summary with verification results |

---

## Approval Record

| Approver | Role | Decision | Date | Notes |
|---|---|---|---|---|
| _Name_ | _Technical reviewer_ | _Approved / Rejected / Pending_ | YYYY-MM-DD | |
| _Name_ | _Change manager_ | _Approved / Rejected / Pending_ | YYYY-MM-DD | |
| _Name_ | _Service owner_ | _Approved / Rejected / Pending_ | YYYY-MM-DD | |

See `approval-workflow.yaml` for the full approval chain based on __CHANGE_TYPE__ change type.
