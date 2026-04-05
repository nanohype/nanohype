# __PROJECT_NAME__ — Rollback Plan

**Change ID:** CHG-XXXX
**Change type:** __CHANGE_TYPE__
**Last updated:** YYYY-MM-DD

---

## Rollback Summary

| Attribute | Value |
|---|---|
| Change ID | CHG-XXXX |
| Service | __PROJECT_NAME__ |
| Rollback feasible | _Yes / No_ |
| Estimated rollback time | _e.g., 30 minutes_ |
| Rollback deadline | _Last point at which clean rollback is possible_ |
| Data reconciliation required | _Yes / No_ |
| Rollback tested in staging | _Yes / No — date of last test_ |

---

## Rollback Triggers

Initiate rollback when any of the following conditions are met. The decision to roll back is made by the change implementer or incident commander, not by waiting for consensus.

### Automatic Rollback Triggers

These conditions should trigger immediate rollback without deliberation:

| Trigger | Threshold | Detection Method |
|---|---|---|
| Service outage | All instances returning 5xx or unreachable | Health check monitoring |
| Data integrity issue | Any confirmed data corruption or loss | Application logs, data validation checks |
| Security vulnerability | Exploitable vulnerability introduced by change | Security scan, external report |

### Decision-Point Triggers

These conditions warrant a rollback decision within 15 minutes:

| Trigger | Threshold | Detection Method |
|---|---|---|
| Elevated error rate | > 2x pre-change baseline for > 5 minutes | Error rate dashboard |
| Latency regression | P99 > 2x pre-change baseline for > 10 minutes | Latency dashboard |
| Health check failures | > 25% of instances failing for > 2 minutes | Health check monitoring |
| Dependent service impact | Downstream errors attributable to change for > 5 minutes | Dependency monitoring |
| Implementation overrun | Change exceeds maintenance window by > 30 minutes | Implementation timeline |

### No-Rollback Conditions

Do NOT roll back for these conditions (fix forward instead):

| Condition | Reason | Alternative Action |
|---|---|---|
| Minor log warnings | Not user-impacting | Monitor and address in follow-up |
| Cosmetic UI differences | Not functionally broken | File bug, fix in next deploy |
| Slightly elevated latency (< 20% increase) | Within acceptable variance | Monitor for 24 hours, optimize if persistent |

---

## Pre-Rollback Checklist

Complete these steps before initiating rollback:

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Announce rollback decision in incident channel | [ ] | Include reason and expected timeline |
| 2 | Confirm rollback materials are accessible (backup, previous image tag, config snapshot) | [ ] | |
| 3 | Notify affected downstream service owners | [ ] | Alert them to expect brief disruption |
| 4 | Suppress non-critical alerts for __PROJECT_NAME__ | [ ] | Prevent alert storm during rollback |
| 5 | Confirm who is executing the rollback and who is verifying | [ ] | Two-person procedure |

---

## Rollback Procedure

### Step 1: Stop Forward Progress

Halt any in-progress migration, deployment, or configuration change. Do not allow partial completion — a clean rollback requires a known state.

```bash
# Cancel any running deployments
kubectl rollout pause deployment/__PROJECT_NAME__ -n production

# If a database migration is running, wait for current statement to complete
# DO NOT kill active transactions — this risks data corruption
```

### Step 2: Restore Previous State

#### Application Rollback

```bash
# Identify the previous stable image tag
kubectl rollout history deployment/__PROJECT_NAME__ -n production

# Roll back to previous revision
kubectl rollout undo deployment/__PROJECT_NAME__ -n production

# Wait for rollout to complete
kubectl rollout status deployment/__PROJECT_NAME__ -n production --timeout=300s
```

#### Database Rollback (if applicable)

```bash
# Verify current migration version
# (Command depends on migration tool — Rails, Flyway, Alembic, etc.)

# Roll back the last migration
# Example: flyway undo
# Example: rails db:rollback STEP=1

# If migration rollback is not possible, restore from backup
# Confirm backup timestamp and verify it predates the change
pg_restore --dbname=__PROJECT_NAME__ --clean /backups/__PROJECT_NAME__-pre-change.dump
```

#### Configuration Rollback (if applicable)

```bash
# Restore previous configuration from version control or config store
# Example: revert config map
kubectl rollout undo configmap/__PROJECT_NAME__-config -n production

# Restart application to pick up reverted config
kubectl rollout restart deployment/__PROJECT_NAME__ -n production
```

### Step 3: Verify Rollback Success

Run each verification check in sequence. All must pass before declaring rollback complete.

| # | Check | Command / Method | Expected Result |
|---|---|---|---|
| 1 | Health check passing | `curl -s https://prod.__PROJECT_NAME__.example.com/ready` | `200 OK` |
| 2 | Application version confirmed | `curl -s https://prod.__PROJECT_NAME__.example.com/health \| jq '.version'` | Previous version string |
| 3 | Error rate at baseline | Check error rate dashboard | < 0.1% (pre-change level) |
| 4 | Latency at baseline | Check latency dashboard | P99 < pre-change value |
| 5 | Database accessible | `pg_isready -h db.__PROJECT_NAME__.internal` | Connection accepted |
| 6 | Downstream services healthy | Check dependent service dashboards | No elevated errors |
| 7 | Data integrity spot check | Run data validation query | Results consistent |

### Step 4: Post-Rollback Actions

1. Re-enable suppressed alerts
2. Announce rollback complete in incident channel with verification results
3. Notify downstream service owners that rollback is complete
4. Notify stakeholders per the communication plan
5. File a post-change review documenting why rollback was needed

---

## Data Reconciliation

If any data was written between the change implementation and the rollback, reconciliation may be needed.

### Identifying Affected Data

```sql
-- Find records created or modified during the change window
SELECT id, created_at, updated_at
FROM affected_table
WHERE updated_at BETWEEN 'YYYY-MM-DD HH:MM:SS' AND 'YYYY-MM-DD HH:MM:SS'
ORDER BY updated_at;
```

### Reconciliation Procedure

| Scenario | Action | Owner |
|---|---|---|
| Records created during change window | Verify data integrity; re-process if needed | _Data team_ |
| Records modified during change window | Compare against pre-change backup; resolve conflicts | _Data team_ |
| Queued messages not yet processed | Messages remain in queue; will process on rollback-restored service | _Platform team_ |
| External API calls made during window | Cannot roll back; document and reconcile manually | _Engineering_ |

---

## Rollback Decision Log

Record the actual rollback decision for post-change review:

| Attribute | Value |
|---|---|
| Rollback initiated | YYYY-MM-DD HH:MM UTC |
| Trigger condition | _Which trigger was met_ |
| Decision made by | _Name and role_ |
| Rollback completed | YYYY-MM-DD HH:MM UTC |
| Total rollback duration | _Minutes_ |
| Data reconciliation needed | _Yes / No_ |
| Post-change review scheduled | YYYY-MM-DD |
