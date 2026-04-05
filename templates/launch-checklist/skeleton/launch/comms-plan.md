# __PROJECT_NAME__ — Communications Plan

**Launch type:** __LAUNCH_TYPE__
**Target launch date:** YYYY-MM-DD
**Last updated:** YYYY-MM-DD

---

## Communication Objectives

- Ensure all internal stakeholders are informed before external announcements
- Coordinate messaging across teams to present a unified launch narrative
- Establish clear channels for issue escalation and status updates during launch window
- Provide support and customer-facing teams with the context they need to handle inquiries

---

## Internal Communications

### Pre-Launch (T-minus)

| Timing | Audience | Channel | Message | Owner |
|---|---|---|---|---|
| T-14 days | Engineering org | Engineering all-hands | Launch scope, timeline, and what to expect | _Eng lead_ |
| T-7 days | All company | Company Slack / email | Feature preview, launch date, FAQ | _PM_ |
| T-7 days | Support team | Support team meeting | Feature walkthrough, known limitations, escalation path | _PM_ |
| T-3 days | Sales team | Sales enablement session | Value proposition, customer talking points, demo script | _PM_ |
| T-1 day | On-call / SRE | On-call briefing | Launch timeline, monitoring plan, rollback triggers | _SRE_ |
| T-1 day | Executive team | Executive summary email | Launch readiness status, go/no-go decision, key risks | _PM_ |

### Launch Day

| Timing | Audience | Channel | Message | Owner |
|---|---|---|---|---|
| Launch start | All company | #launches Slack channel | "Launch is live" announcement with key details | _PM_ |
| Launch start | Engineering | #engineering Slack channel | Deployment status, monitoring dashboard links | _Eng lead_ |
| Launch + 2 hours | All company | #launches Slack channel | Initial metrics update — adoption, errors, performance | _PM_ |
| Launch + 8 hours | Stakeholders | Email | End-of-day status report | _PM_ |

### Post-Launch

| Timing | Audience | Channel | Message | Owner |
|---|---|---|---|---|
| Launch + 24 hours | All company | #launches Slack channel | Day-1 metrics summary, notable issues if any | _PM_ |
| Launch + 1 week | Stakeholders | Email / meeting | Week-1 metrics report, lessons learned, next steps | _PM_ |
| Launch + 2 weeks | All company | Company all-hands | Launch retrospective highlights | _PM_ |

---

## External Communications

### Customer-Facing Announcements

| Timing | Audience | Channel | Message | Owner |
|---|---|---|---|---|
| Launch day | Existing customers | In-app announcement | Feature availability notice with getting-started link | _Product marketing_ |
| Launch day | Existing customers | Email newsletter | Feature announcement with value proposition and CTA | _Product marketing_ |
| Launch day | Public | Blog post | Feature deep-dive with use cases and screenshots | _Content team_ |
| Launch day | Public | Social media | Launch announcement with link to blog post | _Social team_ |
| Launch + 3 days | Existing customers | In-app tooltip | Contextual feature discovery for relevant user segments | _Product marketing_ |
| Launch + 1 week | Public | Blog post | Customer story or early results post | _Content team_ |

### Changelog and Documentation

| Asset | Status | Owner | Notes |
|---|---|---|---|
| Changelog entry | [ ] | _PM_ | Publish at launch time |
| Help center articles | [ ] | _Technical writer_ | Review and publish T-1 |
| API documentation updates | [ ] | _Eng lead_ | Publish at launch time |
| Developer blog post (if API changes) | [ ] | _Developer relations_ | Publish at launch or T+1 |

---

## Escalation During Launch

### Issue Severity and Communication

| Severity | Internal Response | External Response | Decision Maker |
|---|---|---|---|
| P1 — Service down | Incident channel created, all-hands on deck | Status page updated within 15 minutes, customer comms within 30 minutes | _Launch owner_ |
| P2 — Degraded | Team notified in launch channel | Status page updated if customer-visible, proactive email if > 1 hour | _PM + Eng lead_ |
| P3 — Minor issue | Logged in launch channel | No external communication, fix in next deploy | _Eng lead_ |
| Rollback initiated | All-company notification in #launches | Status page updated, customer email within 1 hour | _Launch owner_ |

### Holding Statements

Prepare these before launch so they can be deployed quickly if needed:

**Service disruption:**
> We're aware of an issue affecting __PROJECT_NAME__ and are actively investigating. We'll provide updates every 30 minutes. For urgent needs, contact support at [support channel].

**Rollback:**
> We've temporarily rolled back the recent __PROJECT_NAME__ update while we address an issue discovered during launch. Existing functionality is unaffected. We'll share a revised timeline once the issue is resolved.

---

## Communication Contacts

| Role | Name | Channel | Availability |
|---|---|---|---|
| Launch owner | _Name_ | _Slack / phone_ | Launch day: continuous |
| Product marketing | _Name_ | _Slack_ | Launch day: business hours |
| Support team lead | _Name_ | _Slack_ | Launch day: extended hours |
| Engineering lead | _Name_ | _Slack / phone_ | Launch day: continuous |
| Executive sponsor | _Name_ | _Email / Slack_ | Launch day: on-call for escalation |
