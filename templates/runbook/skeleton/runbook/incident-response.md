# __SERVICE_NAME__ — Incident Response Playbook

**Project:** __PROJECT_NAME__
**On-call tool:** __ON_CALL_TOOL__
**Last updated:** YYYY-MM-DD

---

## Incident Lifecycle

```
Detect → Triage → Respond → Mitigate → Resolve → Review
```

Every incident follows this lifecycle. The goal during an active incident is to mitigate customer impact as quickly as possible. Root cause analysis happens after the incident is resolved.

---

## Phase 1: Detect

### Alert Sources

| Source | Channel | Examples |
|---|---|---|
| Monitoring alerts | __ON_CALL_TOOL__ | Error rate, latency, health check failures |
| Customer reports | Support channel | "I can't access my dashboard" |
| Internal reports | Slack / email | Team member notices anomaly |
| Dependency notifications | Vendor status page | AWS, database provider outage |

### First Responder Checklist

When you receive an alert or report:

- [ ] Acknowledge the alert in __ON_CALL_TOOL__ within the response time SLA
- [ ] Open the service dashboard and check current metrics
- [ ] Check `#ops-incidents` for related ongoing incidents
- [ ] Determine initial severity (P1/P2/P3/P4) using the escalation matrix

---

## Phase 2: Triage

### Severity Classification

| Severity | Criteria | Action |
|---|---|---|
| **P1 — Critical** | Service down, data at risk | Create incident channel, page secondary |
| **P2 — High** | Service degraded, elevated errors | Post in #ops-incidents, begin investigation |
| **P3 — Medium** | Non-critical impact | Investigate during on-call shift |
| **P4 — Low** | No user impact | File ticket for next sprint |

### Triage Decision Tree

1. **Is the service returning errors to users?**
   - Yes → At minimum P2. If >50% of requests affected → P1.
   - No → Continue assessment.

2. **Is data being corrupted or lost?**
   - Yes → P1 immediately. Stop writes if necessary.
   - No → Continue assessment.

3. **Is a critical dependency down?**
   - Yes → Check dependency's status page. If no ETA → P2.
   - No → Likely P3 or P4.

---

## Phase 3: Respond

### For P1 Incidents

1. **Create incident channel:** `#incident-YYYY-MM-DD-short-description`
2. **Assign roles:**

| Role | Responsibility |
|---|---|
| Incident Commander (IC) | Coordinates response, makes decisions, communicates |
| Technical Lead | Investigates root cause, implements fixes |
| Communications Lead | Posts updates to stakeholders |

3. **Post initial update** in the incident channel:

```
INCIDENT DECLARED — P1
Service: __SERVICE_NAME__
Impact: [Describe user-facing impact]
Started: [Timestamp]
Current status: Investigating
IC: [Name]
Next update: [Timestamp, 30 min from now]
```

4. **Begin investigation** following the troubleshooting procedures in `procedures.md`

### For P2 Incidents

1. Post in `#ops-incidents` with service name, impact description, and your name
2. Begin investigation following troubleshooting procedures
3. Escalate to P1 if impact worsens or is not mitigated within 1 hour

---

## Phase 4: Mitigate

The goal of mitigation is to restore service, not to fix the root cause. Common mitigation actions:

### Quick Mitigation Options

| Action | When to Use | Command/Process |
|---|---|---|
| Rollback deploy | Issue started after a deploy | `kubectl rollout undo deployment/__PROJECT_NAME__` |
| Scale up | Resource saturation | `kubectl scale deployment/__PROJECT_NAME__ --replicas=N` |
| Toggle feature flag | New feature causing issues | Disable in feature flag service |
| Failover to replica | Primary database issues | Promote read replica |
| Block bad traffic | Abuse or attack | Update WAF rules at gateway |
| Restart instances | Memory leak or stuck state | `kubectl rollout restart deployment/__PROJECT_NAME__` |

### Mitigation Update Template

Post after each significant action:

```
UPDATE — [Timestamp]
Action taken: [What you did]
Result: [What changed]
Current impact: [Is the issue better, worse, or same?]
Next step: [What you're doing next]
Next update: [Timestamp]
```

---

## Phase 5: Resolve

An incident is **resolved** when:

- [ ] Service metrics have returned to normal for at least 15 minutes
- [ ] No user-facing impact remains
- [ ] Any temporary mitigations are documented for follow-up

### Resolution Announcement

```
RESOLVED — [Timestamp]
Service: __SERVICE_NAME__
Duration: [Total time from detection to resolution]
Impact: [Summary of user-facing impact]
Root cause: [Brief description, or "under investigation"]
Follow-up: [Ticket number for post-incident review]
```

---

## Phase 6: Review

### Post-Incident Review (PIR)

**Timeline:** Schedule within 3 business days of incident resolution.

**Attendees:** IC, Technical Lead, Communications Lead, Engineering Manager, affected team leads.

### PIR Template

```markdown
## Incident: [Title]
**Date:** YYYY-MM-DD
**Duration:** [HH:MM]
**Severity:** [P1/P2]
**IC:** [Name]

## Summary
[2-3 sentence summary of what happened and its impact]

## Timeline
| Time | Event |
|---|---|
| HH:MM | First alert fired |
| HH:MM | IC acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |

## Root Cause
[Detailed explanation of what went wrong and why]

## Impact
- Users affected: [count or percentage]
- Duration of impact: [time]
- Data affected: [if any]
- Revenue impact: [if measurable]

## What Went Well
- [Positive aspect of the response]

## What Could Be Improved
- [Area for improvement]

## Action Items
| Action | Owner | Due Date | Status |
|---|---|---|---|
| [Fix root cause] | [Name] | YYYY-MM-DD | Open |
| [Improve detection] | [Name] | YYYY-MM-DD | Open |
| [Update runbook] | [Name] | YYYY-MM-DD | Open |
```

---

## Communication Templates

### Internal Status Update (Slack)

```
:rotating_light: [SERVICE] INCIDENT — [P1/P2]
Impact: [User-facing description]
Status: [Investigating / Mitigating / Monitoring]
IC: [Name]
Channel: #incident-YYYY-MM-DD-description
Next update: [Time]
```

### Customer-Facing Status Update

```
We are currently experiencing [degraded performance / an outage] affecting
[specific functionality]. Our engineering team is actively investigating
and working to restore normal operations.

Current status: [Investigating / Identified / Mitigating / Monitoring]
Started: [Time and timezone]
Next update: [Time and timezone]

We apologize for the inconvenience and will provide updates as we learn more.
```
