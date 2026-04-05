# __PROJECT_NAME__ — Evidence Collection Template

**Framework:** __FRAMEWORK__
**Last updated:** YYYY-MM-DD

---

## Purpose

This template provides a structured format for collecting and documenting evidence against compliance controls. Each evidence item should map to one or more controls in the control inventory and be stored in the compliance document repository.

---

## Evidence Record

### Metadata

| Field | Value |
|---|---|
| Evidence ID | `EVD-XXXX` |
| Control ID(s) | _e.g., AC-001, AC-002_ |
| Collection date | YYYY-MM-DD |
| Collected by | _Name and role_ |
| Review period | YYYY-MM-DD to YYYY-MM-DD |
| Next collection due | YYYY-MM-DD |
| Storage location | _Link to document repository_ |

### Description

Describe what this evidence demonstrates and which control requirement it satisfies.

> _Example: This evidence demonstrates that multi-factor authentication is enforced for all production system access (Control AC-002). It includes the SSO provider's MFA policy configuration and an enrollment report showing 100% coverage._

---

## Evidence Artifacts

### Artifact 1 — Descriptive Title

| Field | Value |
|---|---|
| Type | _Screenshot / Configuration export / Log extract / Report / Policy document_ |
| Source system | _e.g., SSO provider admin console_ |
| Date captured | YYYY-MM-DD |
| File name | `evidence/YYYY-MM/EVD-XXXX-artifact-1.png` |

**Description:** What does this artifact show? How does it relate to the control?

**Verification notes:** Any observations about the artifact's completeness or accuracy.

---

### Artifact 2 — Descriptive Title

| Field | Value |
|---|---|
| Type | _Screenshot / Configuration export / Log extract / Report / Policy document_ |
| Source system | _e.g., Audit log database_ |
| Date captured | YYYY-MM-DD |
| File name | `evidence/YYYY-MM/EVD-XXXX-artifact-2.csv` |

**Description:** What does this artifact show?

**Verification notes:** Any observations.

---

## Collection Procedures by Evidence Type

### Configuration Evidence

For controls validated by system configuration:

1. Navigate to the relevant admin console or configuration interface
2. Capture a screenshot or export the configuration
3. Include the system name, timestamp, and logged-in user in the capture
4. Note any settings that are not visible in the screenshot but relevant to the control
5. Store with naming convention: `EVD-XXXX-config-[system]-[date].png`

### Process Evidence

For controls validated by operational processes:

1. Pull a sample of relevant records (minimum 10 or the full population if < 25)
2. Document the sampling methodology and population size
3. For each sample item, verify compliance with the control requirement
4. Record pass/fail for each item with notes
5. Calculate compliance rate and document exceptions

**Sample Record:**

| Sample # | Record ID | Date | Compliant | Notes |
|---|---|---|---|---|
| 1 | _e.g., PR-1234_ | YYYY-MM-DD | Yes | Approved by reviewer before merge |
| 2 | _e.g., PR-1235_ | YYYY-MM-DD | Yes | Approved by reviewer before merge |
| 3 | _e.g., PR-1236_ | YYYY-MM-DD | No | Emergency fix merged without review |

**Compliance rate:** X / Y samples compliant (Z%)

**Exceptions:** Document any non-compliant samples and their circumstances.

### Log Evidence

For controls validated by system logs:

1. Define the query parameters (time range, event types, filters)
2. Execute the query against the log system
3. Export results in a reviewable format (CSV or PDF)
4. Highlight relevant entries that demonstrate control operation
5. Note the total event count and any anomalies

### Policy Evidence

For controls validated by documented policies:

1. Confirm the policy document is current (review date within the past year)
2. Verify the policy is approved by the appropriate authority
3. Confirm the policy is accessible to all relevant personnel
4. Note the policy version, approval date, and approver

---

## Quality Checklist

Before submitting evidence for review, verify:

- [ ] Evidence is dated and attributable (who collected it, when, from where)
- [ ] Evidence clearly maps to the referenced control(s)
- [ ] Screenshots are legible and include relevant context (URL, system name, timestamp)
- [ ] Sampling methodology is documented for process evidence
- [ ] Sensitive data is redacted (passwords, PII, secrets)
- [ ] Evidence is stored in the designated repository with correct naming convention
- [ ] Evidence collection is repeatable (another person could follow these steps)
