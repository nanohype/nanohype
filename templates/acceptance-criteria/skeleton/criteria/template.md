# Acceptance Criteria Template: __PROJECT_NAME__

**Format:** __FORMAT__

---

## How to Use This Template

Copy this template for each user story or feature. Fill in the metadata section, write criteria using the Given/When/Then structure, and check off verification items as they are confirmed during review.

---

## Feature: [Feature Name]

### Metadata

| Field | Value |
|---|---|
| Story ID | [TICKET-000] |
| Priority | [Critical / High / Medium / Low] |
| Author | [Name] |
| Reviewer | [Name] |
| Status | [Draft / In Review / Approved / Implemented / Verified] |

### User Story

> As a [role], I want to [action], so that [benefit].

### Acceptance Criteria

#### AC-1: [Criteria Title]

**Given** [precondition describing the initial state]
**When** [action or event that triggers the behavior]
**Then** [expected outcome that must be true]

**And** [additional conditions, if applicable]
**But** [exceptions or exclusions, if applicable]

**Notes:**
- [Clarifying details, edge cases, or design decisions]
- [References to wireframes, API specs, or design documents]

#### AC-2: [Criteria Title]

**Given** [precondition]
**When** [action]
**Then** [outcome]

#### AC-3: [Criteria Title]

**Given** [precondition]
**When** [action]
**Then** [outcome]

### Negative Cases

#### NC-1: [What should NOT happen]

**Given** [precondition]
**When** [invalid action or error condition]
**Then** [expected error handling or rejection behavior]

### Boundary Conditions

| Condition | Input | Expected Result |
|---|---|---|
| Minimum valid | [value] | [accepted] |
| Maximum valid | [value] | [accepted] |
| Below minimum | [value] | [rejected with message] |
| Above maximum | [value] | [rejected with message] |
| Empty input | [blank] | [rejected with message] |

### Non-Functional Requirements

- [ ] Response time under [X]ms at P95 under expected load
- [ ] Accessible via keyboard navigation (no mouse required)
- [ ] Screen reader compatible (ARIA labels present)
- [ ] Works in supported browsers: Chrome, Firefox, Safari, Edge
- [ ] Error states display user-friendly messages (no stack traces)

### Verification Checklist

- [ ] All acceptance criteria reviewed with product owner
- [ ] Negative cases documented and reviewed
- [ ] Boundary conditions identified and documented
- [ ] Test cases exist for each criterion
- [ ] Automated tests cover critical path criteria
- [ ] Accessibility requirements specified
- [ ] Performance requirements specified
