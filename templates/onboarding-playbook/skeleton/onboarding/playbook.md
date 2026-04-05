# __PRODUCT_NAME__ — Onboarding Playbook

**Project:** __PROJECT_NAME__
**Onboarding type:** __ONBOARDING_TYPE__
**Last updated:** YYYY-MM-DD

---

## Onboarding Overview

### Objective

Successfully onboard new customers to __PRODUCT_NAME__ so they achieve their first value milestone within the defined timeframe and build habits that lead to long-term retention.

### Onboarding Model

| Attribute | Detail |
|---|---|
| Type | __ONBOARDING_TYPE__ |
| Duration | _e.g., 30 days for guided, 14 days for self-serve, 90 days for enterprise_ |
| Primary owner | Customer Success Manager |
| Success criteria | Customer reaches "activated" state (see milestones) |

### Onboarding Phases

```
Handoff → Kickoff → Setup → Activation → Adoption → Graduation
```

---

## Phase 1: Sales-to-CS Handoff

**Duration:** 1-2 business days
**Owner:** Account Executive + Customer Success Manager

### Objectives

- Transfer all customer context from sales to CS
- Introduce the CSM to the customer
- Set expectations for the onboarding journey

### Activities

1. AE completes the handoff checklist (see `handoff-checklist.md`)
2. CSM reviews deal notes, success criteria, and customer goals
3. AE sends warm introduction email connecting customer to CSM
4. CSM schedules kickoff call within 3 business days

### Exit Criteria

- [ ] Handoff checklist completed by AE
- [ ] CSM has reviewed all deal context
- [ ] Introduction email sent
- [ ] Kickoff call scheduled

---

## Phase 2: Kickoff

**Duration:** 1 meeting (60 minutes)
**Owner:** Customer Success Manager

### Objectives

- Build relationship with customer stakeholders
- Confirm goals, success metrics, and timeline
- Align on the onboarding plan and communication cadence

### Kickoff Agenda

1. **Introductions (10 min)** — Meet the team, roles, and responsibilities on both sides
2. **Goals review (15 min)** — Confirm what success looks like from the customer's perspective
3. **Onboarding plan walkthrough (15 min)** — Review phases, milestones, and timeline
4. **Technical setup overview (10 min)** — Prerequisites, access, and integration requirements
5. **Q&A and next steps (10 min)** — Address questions, assign first action items

### Kickoff Preparation

| Item | Owner | Notes |
|---|---|---|
| Review handoff notes | CSM | Understand customer goals and context |
| Prepare onboarding deck | CSM | Customize with customer name and goals |
| Provision account | CSM / Support | Ensure login credentials are ready |
| Identify customer champion | CSM | Key contact for day-to-day coordination |

### Exit Criteria

- [ ] Customer goals and success metrics documented
- [ ] Onboarding timeline agreed upon
- [ ] Customer champion identified
- [ ] First setup actions assigned with due dates

---

## Phase 3: Setup

**Duration:** 1-2 weeks (varies by onboarding type)
**Owner:** Customer Success Manager + Technical Support

### Objectives

- Complete technical setup and configuration
- Integrate with customer's existing tools and workflows
- Import initial data and verify accuracy

### Activities

| Task | Owner | Due | Status |
|---|---|---|---|
| Account configuration | CSM | Day 3 | - |
| SSO / authentication setup | Customer IT + Support | Day 5 | - |
| Data import / migration | Support | Day 7 | - |
| Integration setup (API, webhooks) | Customer engineering + Support | Day 10 | - |
| Configuration review and approval | Customer champion | Day 12 | - |

### Common Setup Issues

| Issue | Resolution |
|---|---|
| SSO configuration errors | Share SSO setup guide; escalate to Support if SAML metadata doesn't validate |
| Data import format mismatches | Provide import template; offer CSV validation tool |
| API rate limit concerns | Review usage patterns; adjust limits if needed |
| Missing permissions | Confirm admin roles assigned to customer champion |

### Exit Criteria

- [ ] Account fully configured
- [ ] Integrations tested and working
- [ ] Initial data imported and verified
- [ ] Customer can log in and navigate the product

---

## Phase 4: Activation

**Duration:** 1-2 weeks
**Owner:** Customer Success Manager

### Objectives

- Guide the customer to complete their first meaningful workflow
- Demonstrate value with real data and real outcomes
- Build confidence in the product

### Definition of "Activated"

An account is activated when the customer has completed the following:

- [ ] Created their first [primary object/workflow]
- [ ] Invited at least 2 team members
- [ ] Completed one end-to-end cycle of the core workflow
- [ ] Viewed the results/output dashboard

### Activation Playbook

1. **Guided session (30 min):** Walk through the core workflow with the customer using their own data
2. **Assign homework:** Customer completes 2-3 workflows independently before next check-in
3. **Follow-up check-in (15 min):** Review completed workflows, answer questions, celebrate wins
4. **Share tips:** Send curated tips relevant to their use case and persona

### Exit Criteria

- [ ] Activation criteria met (all checkboxes above)
- [ ] Customer expresses confidence in using the product
- [ ] Any blockers to adoption identified and addressed

---

## Phase 5: Adoption

**Duration:** 2-4 weeks
**Owner:** Customer Success Manager

### Objectives

- Expand usage beyond the champion to the broader team
- Establish recurring usage patterns and habits
- Identify expansion opportunities

### Activities

1. **Team training session (45 min):** Train the broader team on workflows relevant to their roles
2. **Weekly check-ins (15 min):** Monitor usage, address questions, share best practices
3. **Usage review:** Review product analytics to identify adoption gaps and power users
4. **Success story capture:** Document early wins for internal reporting and customer reference

### Adoption Health Indicators

| Indicator | Healthy | At Risk | Critical |
|---|---|---|---|
| Weekly active users | > 60% of seats | 30-60% of seats | < 30% of seats |
| Core workflow completion | > 3x per week | 1-3x per week | < 1x per week |
| Support ticket volume | Decreasing | Stable | Increasing |
| Feature exploration | Using 3+ features | Using 1-2 features | Using only setup features |

### Exit Criteria

- [ ] Multiple team members actively using the product weekly
- [ ] Core workflows integrated into the team's routine
- [ ] No critical support issues outstanding

---

## Phase 6: Graduation

**Duration:** 1 meeting
**Owner:** Customer Success Manager

### Objectives

- Formally transition from onboarding to ongoing customer success
- Confirm the customer has achieved initial value
- Set expectations for the ongoing relationship

### Graduation Meeting Agenda

1. **Wins recap:** Review what the customer has achieved since kickoff
2. **Metrics review:** Compare current state against goals set during kickoff
3. **Ongoing support model:** Explain how to get help going forward
4. **QBR scheduling:** Set up the first quarterly business review
5. **Feedback:** Ask for candid feedback on the onboarding experience

### Exit Criteria

- [ ] Customer confirms they are achieving the outcomes discussed at kickoff
- [ ] Ongoing communication cadence agreed upon
- [ ] First QBR scheduled
- [ ] Onboarding feedback captured in CRM

---

## Escalation Triggers

At any point during onboarding, escalate if:

| Trigger | Action | Escalation To |
|---|---|---|
| Customer misses 2+ scheduled calls | Reach out via alternate channel; loop in AE if no response | CS Manager |
| Setup blocked for > 5 business days | Escalate technical blocker to engineering | Support Lead |
| Champion leaves the customer organization | Identify new champion; re-engage sponsor | CS Manager + AE |
| Customer expresses dissatisfaction | Schedule immediate call; document concerns | CS Manager |
| Usage drops to zero for 7+ days post-activation | Proactive outreach with value reinforcement | CSM |
