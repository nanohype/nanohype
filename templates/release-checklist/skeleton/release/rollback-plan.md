# Rollback Plan: __PROJECT_NAME__

**Release Type:** __RELEASE_TYPE__
**Version:** [X.Y.Z]
**Previous Version:** [X.Y.Z-1]
**Last Updated:** YYYY-MM-DD

---

## Rollback Decision Criteria

Initiate rollback when any of the following conditions are met. The on-call engineer or release manager can trigger a rollback without waiting for additional approval.

### Automatic Rollback Triggers

These conditions warrant immediate rollback without deliberation:

- **Error rate exceeds 5%** for more than 5 consecutive minutes
- **P95 response time exceeds 5 seconds** for more than 5 consecutive minutes
- **Health endpoint returns non-200** for more than 2 consecutive minutes
- **Data corruption detected** in any form
- **Security vulnerability identified** that is actively exploitable
- **Payment processing failures** above 1% error rate

### Manual Rollback Triggers

These conditions require assessment but should bias toward rollback:

- Critical user workflow broken with no workaround
- External integration failures affecting more than 10% of requests
- Memory leak or resource exhaustion trending toward limit
- Multiple unrelated errors appearing simultaneously
- Customer-reported issues validated as release-related

### Conditions That Do NOT Warrant Rollback

- Cosmetic UI issues without functional impact
- Log noise from non-critical warnings
- Performance degradation within acceptable thresholds
- Issues reproducible only in non-production environments

---

## Rollback Procedures

### Step 1: Assess and Communicate

**Time limit:** 5 minutes

1. Confirm the issue is caused by the current deployment (not an external dependency)
2. Notify the release channel: `@release-team Initiating rollback of __PROJECT_NAME__ vX.Y.Z — [brief reason]`
3. Update status page to "Investigating" if user-facing impact is confirmed

### Step 2: Application Rollback

**Time limit:** 15 minutes

**Option A: Revert Deployment (preferred)**
```bash
# Redeploy previous known-good version
# Replace with your deployment tool's rollback command
deploy rollback __PROJECT_NAME__ --to-version <previous-version>
```

**Option B: Feature Flag Disable**
```bash
# If the issue is isolated to a flagged feature, disable the flag
# instead of a full rollback
feature-flags disable __PROJECT_NAME__:<flag-name> --environment production
```

**Option C: Traffic Shift**
```bash
# If using blue/green or canary, shift traffic back to the previous version
traffic shift __PROJECT_NAME__ --target previous --percentage 100
```

### Step 3: Database Rollback (If Applicable)

**Only execute if this release included database migrations.**

1. [ ] Verify migration rollback scripts exist and are tested
2. [ ] Put application into maintenance mode
3. [ ] Execute rollback migration:
   ```bash
   # Replace with your migration tool's rollback command
   migrate rollback --to <previous-migration-id>
   ```
4. [ ] Verify database schema matches previous version expectations
5. [ ] Verify data integrity after rollback
6. [ ] Remove maintenance mode

**WARNING:** Database rollbacks may cause data loss if the migration was destructive. Verify the migration type before executing. If the migration is not safely reversible, coordinate with the database team.

### Step 4: Verification

**Time limit:** 10 minutes

1. [ ] Confirm previous version is running (`GET /version`)
2. [ ] Run smoke test suite against production
3. [ ] Verify error rate has returned to baseline
4. [ ] Verify response times have returned to baseline
5. [ ] Confirm critical user workflows are functional
6. [ ] Check database connectivity and query performance

### Step 5: Post-Rollback Communication

1. [ ] Update release channel: `@release-team Rollback complete. __PROJECT_NAME__ is running vX.Y.Z-1. Monitoring.`
2. [ ] Update status page to "Resolved" or "Monitoring"
3. [ ] Notify affected stakeholders with a brief summary
4. [ ] Create incident ticket for tracking and postmortem

---

## Post-Rollback Actions

### Immediate (within 1 hour)

- [ ] Confirm stability metrics are at pre-deployment baseline
- [ ] Document the timeline: issue detected, rollback initiated, rollback completed
- [ ] Collect relevant logs and error traces for diagnosis
- [ ] Assign owner for root cause investigation

### Short-Term (within 24 hours)

- [ ] Root cause identified and documented
- [ ] Fix developed and validated in staging
- [ ] Test plan updated to cover the failure scenario
- [ ] Postmortem scheduled (for S1/S2 incidents)

### Before Re-Release

- [ ] Root cause fixed and verified in staging
- [ ] Additional test coverage for the failure scenario
- [ ] Rollback procedure validated against the new fix
- [ ] Stakeholders informed of re-release plan and timeline

---

## Contact List

| Role | Name | Contact | Escalation |
|---|---|---|---|
| Release Manager | | | Primary |
| On-Call Engineer | | | Primary |
| Engineering Lead | | | 15-min escalation |
| Database Admin | | | If DB rollback needed |
| Infrastructure Lead | | | If infra issue |
| Product Owner | | | Communication |

---

## Rollback Testing Schedule

The rollback procedure itself must be tested regularly to ensure it works when needed.

- **Before each major release:** Full rollback rehearsal in staging
- **Quarterly:** Rollback drill in pre-production environment
- **After infrastructure changes:** Verify rollback procedure still works

**Last Tested:** YYYY-MM-DD
**Tested By:** [Name]
**Result:** [Pass / Fail — notes]
