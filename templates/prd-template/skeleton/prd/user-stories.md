# __PRODUCT_NAME__ — User Stories

**Project:** __PROJECT_NAME__
**Status:** Draft

---

## Story Map Overview

Stories are organized by persona, then grouped by workflow. Each story follows the format:

> As a [persona], I want [capability] so that [outcome].

Priority levels: **P0** (must-have), **P1** (should-have), **P2** (nice-to-have).

---

## Persona: Primary User

### Workflow: Core Task

#### Story 1 — Descriptive Title

- **As a** primary user
- **I want** to perform a specific action
- **So that** I achieve a measurable outcome

**Priority:** P0

**Acceptance Criteria:**

- [ ] Given [precondition], when [action], then [expected result]
- [ ] Given [precondition], when [action], then [expected result]
- [ ] Edge case: [describe boundary condition and expected behavior]

**Notes:** Additional context, design references, or technical considerations.

---

#### Story 2 — Descriptive Title

- **As a** primary user
- **I want** to perform another action
- **So that** I achieve another outcome

**Priority:** P1

**Acceptance Criteria:**

- [ ] Given [precondition], when [action], then [expected result]
- [ ] Given [precondition], when [action], then [expected result]

---

## Persona: Secondary User

### Workflow: Administration

#### Story 3 — Descriptive Title

- **As a** secondary user (e.g., admin, manager)
- **I want** to configure or manage a capability
- **So that** the system operates correctly for my team

**Priority:** P0

**Acceptance Criteria:**

- [ ] Given [precondition], when [action], then [expected result]
- [ ] Given [precondition], when [action], then [expected result]

---

## Persona: System

### Workflow: Background Processing

#### Story 4 — Descriptive Title

- **As** the system
- **I need** to perform an automated action
- **So that** data integrity and performance are maintained

**Priority:** P1

**Acceptance Criteria:**

- [ ] Given [trigger condition], when [event], then [system behavior]
- [ ] Given [failure condition], when [event], then [graceful degradation]

---

## Story Dependencies

| Story | Depends On | Blocked By |
|---|---|---|
| Story 2 | Story 1 | - |
| Story 3 | Story 1 | - |
| Story 4 | Story 1, Story 3 | Auth service API |
