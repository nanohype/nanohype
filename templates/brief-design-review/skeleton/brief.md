# Design Review Brief — __PROJECT_NAME__

## Context

You are conducting a design review for **__PROJECT_NAME__**, targeting the **__TARGET_PLATFORM__** platform. The review scope is **__AUDIT_SCOPE__**.

The design system reference is located at: __DESIGN_SYSTEM_URL__

This review exists because design drift accumulates silently. Components get modified in isolation, spacing values get hardcoded, color tokens get approximated, and accessibility attributes get dropped during iteration. A systematic review catches these issues before they compound into an inconsistent, inaccessible product experience.

Your review should treat the design system as the source of truth. Where the design system is incomplete or ambiguous, flag the gap rather than making assumptions. Where the implementation diverges from the design system, document the divergence with enough specificity that a designer or engineer can locate and resolve it.

The __TARGET_PLATFORM__ platform context matters because it determines which interaction patterns, accessibility standards, and rendering behaviors are relevant. A web review checks WCAG compliance and responsive behavior. An iOS review checks Human Interface Guidelines adherence. An Android review checks Material Design conformance. Cross-platform reviews must account for platform-specific expectations.

## Brief

Produce a **design review findings report** for __PROJECT_NAME__.

Your analysis should cover these areas systematically:

- **Visual consistency audit** — Compare implemented UI against design system specifications. Check typography scales, color token usage, spacing values, elevation/shadow application, border radii, and iconography. Identify components that use hardcoded values instead of design tokens.
- **Design token coverage** — Evaluate how completely the design token system covers the product's visual vocabulary. Identify tokens that exist in the design system but are unused in the product, values used in the product that have no corresponding token, and tokens that are defined but semantically ambiguous.
- **Component coherence** — Review component-level consistency. Check that similar UI patterns use the same component, that component variants are used correctly, that composition patterns (how components nest and combine) follow the design system's guidance, and that component states (hover, focus, active, disabled, error, loading) are implemented completely.
- **Accessibility compliance** — Audit against WCAG 2.1 AA standards at minimum. Check color contrast ratios, focus management, keyboard navigation order, screen reader compatibility, touch target sizes (for mobile), motion preferences, and semantic HTML structure. Flag any AA failures as high severity.
- **Responsive behavior** — Evaluate how the design adapts across breakpoints. Check that layouts reflow correctly, that typography scales appropriately, that touch targets resize for mobile, and that no content is clipped or hidden unintentionally.
- **Interaction pattern consistency** — Review transitions, animations, loading states, empty states, and error states for consistency. Check that similar actions produce similar feedback patterns across the product.

For each finding, assign a severity (critical, high, medium, low) based on user impact and deviation magnitude.

## Output Specification

Produce a Markdown document with the following structure:

- **Executive Summary** — A three-to-five sentence overview of the design's current state, the most impactful findings, and the recommended priority for remediation.
- **Methodology** — Brief description of what was reviewed, against what standards, and any limitations or areas excluded from scope.
- **Findings by Category** — One section per audit area (visual consistency, token coverage, component coherence, accessibility, responsive behavior, interaction patterns). Each section contains a table of findings with columns: ID, Description, Severity, Location, Recommendation.
- **Token Gap Analysis** — A dedicated section listing missing tokens, orphaned tokens, and token naming inconsistencies. Include a table with columns: Token Name, Status (missing/orphaned/misnamed), Current Value, Recommended Action.
- **Accessibility Scorecard** — A summary table mapping WCAG 2.1 AA criteria to pass/fail/partial status with notes on each.
- **Prioritized Remediation Plan** — Findings grouped into three tiers: immediate (critical/high severity), next sprint (medium severity), and backlog (low severity). Each tier should include estimated effort where possible.
- **Appendix** — Screenshots, annotated comparisons, or reference links supporting specific findings.

Use consistent finding IDs (e.g., DR-001, DR-002) that can be referenced in tickets or follow-up reviews.

## Quality Criteria

The review is complete and useful when:

- Every finding includes a specific location (page, component, or screen), not just a general observation
- Severity ratings are justified by user impact, not subjective preference
- Accessibility findings reference specific WCAG criteria (e.g., 1.4.3 Contrast)
- The token gap analysis distinguishes between missing tokens (need to create), orphaned tokens (safe to remove), and semantic mismatches (need to rename or reclassify)
- Recommendations are actionable — an engineer or designer can pick up any finding and resolve it without further research
- The remediation plan is ordered by impact-to-effort ratio, not just severity
- The report contains zero subjective opinions presented as findings — every finding is grounded in a measurable standard or documented design system specification
- Platform-specific expectations for __TARGET_PLATFORM__ are reflected in both the audit criteria and the findings
