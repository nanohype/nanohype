# Product Requirements Document Brief — __PROJECT_NAME__

## Context

You are drafting a product requirements document for **__PRODUCT_NAME__** (project codename: **__PROJECT_NAME__**).

The core problem: **__PROBLEM_STATEMENT__**

Target audience: __TARGET_AUDIENCE__

Existing research: __EXISTING_RESEARCH__

A PRD bridges the gap between product vision and engineering execution. It is the canonical document that defines *what* to build and *why*, without prescribing *how* to build it. Engineering teams use it to scope work, design systems, and make tradeoff decisions. Design teams use it to understand user needs and interaction requirements. Leadership uses it to evaluate alignment with business strategy and resource allocation.

The problem statement above is the starting point, not the conclusion. Your job is to decompose that problem into concrete requirements, user stories, and success criteria. Where the problem statement is vague, sharpen it. Where it conflates multiple problems, separate them. Where it assumes a solution, reframe it as a need.

If a target audience is specified, validate that the problem statement resonates with those segments. If no target audience is specified, define the primary and secondary audience segments as part of the PRD. Audience definition should be specific enough to inform design decisions — not just "developers" but "senior backend engineers at mid-size SaaS companies evaluating observability tools."

If existing research is referenced, incorporate its findings into the requirements rationale. If no research exists, flag the assumptions that would benefit from validation and recommend specific research methods for each.

## Brief

Produce a **product requirements document** for __PRODUCT_NAME__.

Your analysis and drafting should cover:

- **Problem decomposition** — Break __PROBLEM_STATEMENT__ into constituent problems. Identify which are root causes and which are symptoms. Map each sub-problem to the user segment it affects most and the business outcome it impacts.
- **User and audience analysis** — Define primary and secondary user personas with enough specificity to drive design decisions. For each persona, document their goals, pain points, current workarounds, and what success looks like from their perspective.
- **Requirements definition** — Draft functional requirements (what the product does) and non-functional requirements (performance, security, scalability, accessibility, compliance). Organize functional requirements by user workflow, not by feature. Each requirement must be testable — if you cannot describe how to verify it, it is not a requirement.
- **User stories** — Write user stories in standard format (As a [persona], I want [action], so that [outcome]). Group stories into epics. Assign priority (must-have, should-have, nice-to-have) using MoSCoW methodology. Include acceptance criteria for each must-have story.
- **Scope boundaries** — Explicitly define what is out of scope for the initial release. Explain *why* each exclusion is deferred, not just that it is. This prevents scope creep by making the tradeoffs visible.
- **Success metrics** — Define quantitative KPIs for launch success and ongoing health. For each metric, specify: the measurement method, the baseline (current state or zero), the target at 30/60/90 days, and the decision that metric informs. Distinguish between leading indicators (predict future success) and lagging indicators (confirm past success).
- **Assumptions and risks** — List every assumption the PRD makes that has not been validated. For each assumption, describe what changes if it is wrong. List risks with likelihood, impact, and mitigation strategies.
- **Dependencies** — Identify technical, organizational, and external dependencies. For each, specify the owner, timeline, and what happens if the dependency is not met.

## Output Specification

Produce a Markdown document with the following structure:

- **Executive Summary** — Product name, one-paragraph problem statement, proposed solution summary, key metrics, and target launch timeline. A reader should understand the product's purpose and scope from this section alone.
- **Problem Statement** — Expanded, decomposed version of the core problem with evidence and user impact analysis.
- **Audience and Personas** — Detailed persona definitions with goals, pain points, and jobs-to-be-done.
- **Goals and Non-Goals** — Explicit enumeration of what this release aims to achieve and what it explicitly defers.
- **Functional Requirements** — Organized by user workflow. Each requirement has an ID (e.g., FR-001), description, priority, and acceptance criteria.
- **Non-Functional Requirements** — Performance targets, security requirements, accessibility standards, scalability expectations, and compliance needs. Each with measurable criteria.
- **User Stories and Epics** — Grouped by epic, prioritized by MoSCoW, with acceptance criteria for must-have stories.
- **Success Metrics** — KPI table with metric name, measurement method, baseline, 30/60/90-day targets, and the decision each metric informs.
- **Assumptions and Risks** — Assumption register and risk matrix with likelihood, impact, and mitigation.
- **Dependencies** — Dependency map with owners, timelines, and contingency plans.
- **Open Questions** — Unresolved questions that require stakeholder input before engineering can begin, with suggested owners for each.

## Quality Criteria

The PRD is complete and useful when:

- Every functional requirement has an ID, a priority, and testable acceptance criteria — no requirement is described only in narrative prose
- User stories reference specific personas defined in the document, not generic "the user"
- Success metrics include baselines and targets, not just metric names — "increase retention" is not a metric, "increase 30-day retention from 45% to 60%" is
- Out-of-scope items include rationale for deferral, not just a list of excluded features
- The assumptions register flags at least three assumptions that would change the product direction if invalidated
- Non-functional requirements specify measurable thresholds (e.g., "p99 latency under 200ms" not "the system should be fast")
- The PRD is implementation-agnostic — it describes what and why, never how. No technology choices, architecture decisions, or UI wireframes unless they are themselves requirements
- Open questions are specific enough to be answered in a single meeting or decision thread, not vague prompts for further discussion
- A senior engineer reading this PRD can estimate scope within +/- 30% without additional clarification
