# __PRODUCT_NAME__ — Product Requirements Document

**Project:** __PROJECT_NAME__
**Status:** Draft
**Last updated:** YYYY-MM-DD

---

## Problem Statement

### Background

Describe the market context, user pain points, and business opportunity that motivate this product. Ground the problem in observed behavior, support tickets, churn data, or competitive pressure rather than assumptions.

### Problem Definition

State the core problem in one to two sentences. A good problem statement is specific, measurable, and tied to a user outcome.

> _Example: Users spend an average of 45 minutes per week manually reconciling data across three disconnected tools, leading to errors in 12% of reports and contributing to a 15% churn rate among power users._

### Who Is Affected

| Persona | Pain Level | Current Workaround |
|---|---|---|
| _e.g., Operations Manager_ | High | Manual spreadsheet reconciliation |
| _e.g., Analyst_ | Medium | Copy-paste between dashboards |

---

## Goals and Non-Goals

### Goals

1. **Primary:** Define the primary outcome this product must achieve
2. **Secondary:** Define supporting outcomes that reinforce the primary goal
3. **Tertiary:** Define nice-to-have outcomes that add value if achieved

### Non-Goals

- Explicitly list things this product will _not_ do in this phase
- Non-goals prevent scope creep and align stakeholders on boundaries

---

## Scope

### In Scope

- Feature or capability included in this release
- Another feature or capability

### Out of Scope

- Feature deferred to a future phase
- Integration that will be addressed later

---

## Solution Overview

### Proposed Approach

Describe the high-level solution direction. Focus on the "what" and "why" rather than implementation details. Reference any design explorations, prototypes, or technical spikes that informed this direction.

### Key Workflows

1. **Workflow A:** Describe the primary user flow from trigger to outcome
2. **Workflow B:** Describe a secondary flow if applicable

### Dependencies

| Dependency | Owner | Status | Risk |
|---|---|---|---|
| _e.g., Auth service API_ | Platform team | In progress | Medium |
| _e.g., Design system components_ | Design team | Complete | Low |

---

## Constraints

### Technical Constraints

- Constraint description and its impact on the solution
- Another constraint

### Business Constraints

- Timeline, budget, regulatory, or partnership constraints
- Compliance or legal requirements

### Design Constraints

- Accessibility requirements (WCAG level)
- Platform or device support requirements

---

## Milestones

| Milestone | Target Date | Success Criteria | Owner |
|---|---|---|---|
| Discovery complete | YYYY-MM-DD | Research synthesized, hypotheses validated | Product |
| Design review | YYYY-MM-DD | Wireframes approved, edge cases documented | Design |
| Alpha build | YYYY-MM-DD | Core workflows functional in staging | Engineering |
| Beta launch | YYYY-MM-DD | Cohort onboarded, feedback loop active | Product |
| GA release | YYYY-MM-DD | Success metrics trending positive for 2 weeks | Product |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|---|---|---|---|
| _e.g., Do we support offline mode in v1?_ | Product | YYYY-MM-DD | Pending |
| _e.g., What is the data retention policy?_ | Legal | YYYY-MM-DD | Pending |

---

## Appendix

### Related Documents

- Research findings: `research/synthesis-template.md`
- User stories: `prd/user-stories.md`
- Success metrics: `prd/success-metrics.yaml`

### Revision History

| Date | Author | Changes |
|---|---|---|
| YYYY-MM-DD | _Author_ | Initial draft |
