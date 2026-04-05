# __SERVICE_NAME__ — Incident Postmortem

**Project:** __PROJECT_NAME__
**Incident ID:** INC-XXXX
**Date of incident:** YYYY-MM-DD
**Postmortem author:** _Name_
**Last updated:** YYYY-MM-DD

---

## Incident Summary

| Attribute | Value |
|---|---|
| Service affected | __SERVICE_NAME__ |
| Severity | _P1 / P2 / P3_ |
| Duration | _Total time from detection to resolution_ |
| Time to detect | _Time from incident start to first alert_ |
| Time to mitigate | _Time from detection to user impact reduced_ |
| Time to resolve | _Time from detection to full resolution_ |
| Customer impact | _Number of affected users / requests / transactions_ |
| Revenue impact | _Estimated revenue loss, if applicable_ |
| Data loss | _Yes / No — describe if yes_ |

### One-Sentence Summary

Write a single sentence that captures what happened and what the impact was.

> _Example: A misconfigured database migration caused a 47-minute outage of __SERVICE_NAME__'s write path, resulting in failed transactions for approximately 12,000 users._

---

## Status

| Phase | Status |
|---|---|
| Incident resolved | [ ] |
| Postmortem written | [ ] |
| Postmortem reviewed | [ ] |
| Action items assigned | [ ] |
| Action items completed | [ ] |
| Follow-up review scheduled | [ ] |

---

## Impact Assessment

### User Impact

| Impact Category | Details |
|---|---|
| Affected user segments | _e.g., All users, enterprise tier only, specific region_ |
| Number of affected users | _Exact or estimated count_ |
| User-visible symptoms | _e.g., Error pages, slow responses, missing data_ |
| Duration of user impact | _May differ from total incident duration_ |
| Support tickets received | _Count and summary of themes_ |

### Business Impact

| Impact Category | Details |
|---|---|
| Revenue impact | _Estimated lost or delayed revenue_ |
| SLA breach | _Yes / No — which SLA, by how much_ |
| Contractual impact | _Customer credits, penalties, or obligations triggered_ |
| Reputation impact | _Social media mentions, press, customer escalations_ |

### Technical Impact

| Impact Category | Details |
|---|---|
| Data integrity | _Was any data lost, corrupted, or inconsistent?_ |
| Downstream services | _Which dependent services were affected?_ |
| Recovery actions | _Data backfills, cache rebuilds, manual corrections needed_ |

---

## Timeline

Reconstruct the timeline from logs, alerts, and team communications. Use UTC timestamps for consistency.

| Time (UTC) | Phase | Event | Actor |
|---|---|---|---|
| HH:MM | **Trigger** | _Describe the triggering event (e.g., deploy, config change, traffic spike)_ | _System / Person_ |
| HH:MM | **Onset** | _First system symptom (e.g., error rate spike, latency increase)_ | _System_ |
| HH:MM | **Detection** | _How the incident was detected (alert, customer report, manual observation)_ | _Alert / Person_ |
| HH:MM | **Response** | _First human response — who was paged, who acknowledged_ | _On-call engineer_ |
| HH:MM | **Investigation** | _Initial diagnosis steps taken_ | _On-call engineer_ |
| HH:MM | **Escalation** | _When and why escalation occurred_ | _On-call engineer_ |
| HH:MM | **Mitigation** | _Action taken to reduce user impact (e.g., rollback, failover, feature disable)_ | _Engineer_ |
| HH:MM | **Verification** | _Confirmed mitigation effective — metrics returning to normal_ | _Engineer_ |
| HH:MM | **Resolution** | _Root cause addressed and full service restored_ | _Engineer_ |
| HH:MM | **All clear** | _Incident declared resolved, monitoring returns to normal_ | _Incident commander_ |

See `timeline.yaml` for the structured version of this timeline.

---

## Root Cause Analysis

### What Happened

Describe the chain of events from the triggering action to the user-visible impact. Be specific about what failed, what state the system was in, and what assumptions were violated.

### 5 Whys

Use the 5 Whys technique to trace from symptoms to systemic root cause. The goal is to move beyond the immediate cause to the organizational or process failure that allowed it.

**Why #1:** Why did the incident occur?
> _e.g., The database migration contained a schema change that was incompatible with the running application version._

**Why #2:** Why was the incompatible migration deployed?
> _e.g., The migration was tested against the development database schema, which had diverged from production._

**Why #3:** Why had the development schema diverged from production?
> _e.g., Schema drift is not monitored — there is no automated comparison between development and production schemas._

**Why #4:** Why is schema drift not monitored?
> _e.g., The team assumed CI/CD pipeline tests would catch schema incompatibilities, but those tests run against a freshly-migrated database, not the current production schema._

**Why #5:** Why don't CI tests validate against the production schema?
> _e.g., There is no process for snapshot-testing migrations against a production-like schema before deployment._

### Root Cause Summary

State the root cause in one to two sentences, referencing the deepest "why" that reveals a systemic fix.

> _Example: The root cause was the absence of schema drift detection between environments, combined with CI tests that validated migrations against a clean database rather than the current production schema._

### Contributing Factors

| Factor | Description | Impact on Incident |
|---|---|---|
| _e.g., Missing pre-deploy schema check_ | _No automated comparison of migration against production schema_ | _Allowed incompatible migration to reach production_ |
| _e.g., Slow rollback procedure_ | _Rollback required manual database intervention, adding 15 minutes_ | _Extended user impact duration_ |
| _e.g., Alert delay_ | _Error rate alert had a 5-minute evaluation window_ | _Added 5 minutes to detection time_ |

---

## What Went Well

Acknowledge what worked during the incident. This reinforces good practices and provides balance.

- _e.g., On-call engineer responded within 3 minutes of page_
- _e.g., Incident channel was created immediately with all relevant parties_
- _e.g., Customer communication was sent within 20 minutes of detection_
- _e.g., Monitoring caught the issue before customer reports_

---

## What Went Poorly

Identify what didn't work, without assigning blame to individuals. Focus on processes, tools, and systems.

- _e.g., Rollback took 15 minutes because it required manual database steps_
- _e.g., Runbook did not cover this specific failure mode_
- _e.g., Staging environment did not reproduce the issue because schemas were different_
- _e.g., Communication to the customer success team was delayed by 45 minutes_

---

## Lessons Learned

Synthesize the incident into durable insights that inform future engineering and operational decisions.

| Lesson | Implication |
|---|---|
| _e.g., CI must validate against production-like state_ | _Add schema snapshot comparison to deploy pipeline_ |
| _e.g., Manual rollback steps extend outage duration_ | _Automate rollback for database migrations_ |
| _e.g., Alert evaluation windows trade off speed for noise_ | _Review alert windows for critical-path services_ |

---

## Action Items

Each action item should be specific, assigned, and timeboxed. Use SMART criteria: Specific, Measurable, Assignable, Relevant, Time-bound.

| # | Action | Priority | Owner | Due Date | Status | Ticket |
|---|---|---|---|---|---|---|
| 1 | _Add production schema snapshot comparison to CI pipeline_ | P1 | _Engineer_ | YYYY-MM-DD | Open | _JIRA-XXX_ |
| 2 | _Automate database migration rollback procedure_ | P1 | _Engineer_ | YYYY-MM-DD | Open | _JIRA-XXX_ |
| 3 | _Reduce error rate alert evaluation window from 5 min to 2 min_ | P2 | _SRE_ | YYYY-MM-DD | Open | _JIRA-XXX_ |
| 4 | _Add this failure mode to the __SERVICE_NAME__ runbook_ | P2 | _SRE_ | YYYY-MM-DD | Open | _JIRA-XXX_ |
| 5 | _Update staging environment to mirror production schema weekly_ | P2 | _Platform_ | YYYY-MM-DD | Open | _JIRA-XXX_ |

See `follow-up-tracker.yaml` for the structured action item tracker.

---

## Appendix

### Related Documents

- Runbook: `runbook/procedures.md`
- Timeline (structured): `postmortem/timeline.yaml`
- Follow-up tracker: `postmortem/follow-up-tracker.yaml`
- Incident channel: _Link to Slack channel archive_
- Monitoring dashboard: _Link to dashboard at time of incident_

### Revision History

| Date | Author | Changes |
|---|---|---|
| YYYY-MM-DD | _Author_ | Initial postmortem draft |
| YYYY-MM-DD | _Reviewer_ | Review comments incorporated |
