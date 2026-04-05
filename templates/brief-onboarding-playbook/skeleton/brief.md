# Onboarding Playbook Brief — __PROJECT_NAME__

## Context

You are producing a customer onboarding playbook for **__PRODUCT_NAME__** (project: **__PROJECT_NAME__**). The onboarding model is **__ONBOARDING_MODEL__** with a target time-to-value of **__TIME_TO_VALUE__**.

Key milestones: __KEY_MILESTONES__

An onboarding playbook is the operational system that turns a signed contract into an activated customer. It defines every stage between "deal closed" and "customer realizing value," with explicit actions, owners, health indicators, and intervention triggers at each stage. The playbook serves customer success managers, onboarding specialists, and solutions engineers — anyone responsible for getting a customer from purchase to productive use.

The onboarding model determines the playbook's intensity and resource allocation. A guided model assigns a dedicated CSM who drives the process through scheduled touchpoints. A self-serve model provides automated sequences with support available on-demand. A hybrid model blends automated progression with human checkpoints at critical milestones. A white-glove model provides hands-on assistance throughout, typically for enterprise accounts. Your playbook should be designed for the __ONBOARDING_MODEL__ model specifically, with clear resource requirements and capacity planning implications.

Time-to-value (__TIME_TO_VALUE__) is the north star metric for onboarding. It measures how quickly a customer reaches the moment where they experience the core value proposition of __PRODUCT_NAME__. This is not the same as "fully onboarded" — it is the first moment of genuine value realization. The playbook must define what that moment is, create a direct path to it, and remove every obstacle along the way.

If key milestones are specified above, they represent the critical checkpoints that customers must pass through on the way to value realization. If not specified, the playbook should define milestones based on product adoption patterns: account setup, first meaningful action, team activation, workflow integration, and value realization.

The playbook must account for the reality that not every customer will follow the happy path. Some will stall, some will regress, some will go silent. The health scoring and intervention system must detect these patterns early and prescribe specific recovery actions.

## Brief

Produce a **customer onboarding playbook** for __PRODUCT_NAME__.

Your analysis and design should cover:

- **Onboarding stage definition** — Define the stages of the onboarding journey from contract signature through value realization and handoff to ongoing success management. For each stage, specify: duration, objectives, key activities, responsible roles, entry criteria, and exit criteria. Stages should be sequential but account for customers who move at different speeds.
- **Milestone framework** — Define measurable milestones that indicate progress toward value realization. Each milestone should be a specific, observable customer action — not a time-based checkpoint. For each milestone, define: what the customer has achieved, how it is measured (product analytics event, CSM verification, or customer confirmation), the target timeframe, and what blocks most customers from reaching it.
- **Touchpoint design** — Design the communication and engagement sequence for the __ONBOARDING_MODEL__ model. Define each touchpoint: channel (email, call, in-app, meeting), timing (relative to signup or previous milestone), purpose, content, and owner. The sequence should balance progress-driving outreach with responsiveness to customer pace.
- **Health scoring** — Create a customer health score model specific to onboarding. Define the inputs (product usage metrics, milestone completion, engagement responsiveness, support ticket volume, NPS/CSAT responses), the weighting, and the score thresholds that classify customers as healthy, at-risk, or critical. The health score should be predictive, not just descriptive — it should identify risk before the customer goes silent.
- **Intervention playbooks** — Design specific intervention sequences for common risk patterns: stalled onboarding, champion departure, technical blockers, scope expansion requests, low engagement, and negative sentiment. Each intervention should define: trigger condition, response timeline, prescribed actions, escalation criteria, and success criteria for returning the customer to healthy status.
- **Resource and capacity model** — Define the staffing requirements for the __ONBOARDING_MODEL__ model. Specify CSM-to-customer ratios, specialist involvement triggers, and time allocation per stage. Include capacity planning guidelines so the team knows when to hire ahead of demand.
- **Handoff criteria** — Define when and how a customer transitions from onboarding to ongoing customer success management. The handoff should be based on milestone completion, not calendar time. Specify the handoff checklist, the information transfer protocol, and the post-handoff monitoring period.
- **Feedback and iteration** — Design the mechanism for capturing onboarding friction, product gaps, and process improvements. Specify what data is collected, when, how it is analyzed, and how it feeds back into playbook revisions and product roadmap input.

## Output Specification

Produce a Markdown document with the following structure:

- **Playbook Overview** — Onboarding model description, time-to-value definition and target, and a stage-by-stage summary diagram in text format.
- **Onboarding Stages** — One section per stage with duration, objectives, activities, roles, entry/exit criteria, and common failure points.
- **Milestone Map** — Table of milestones with columns: milestone name, stage, measurement method, target timeframe, common blockers, and intervention trigger if missed.
- **Touchpoint Sequence** — Chronological table of touchpoints with columns: timing, channel, purpose, content summary, owner, and milestone association.
- **Health Score Model** — Input definitions, weighting formula, threshold definitions (healthy/at-risk/critical), and example score calculations for each category.
- **Intervention Playbooks** — One subsection per risk pattern with trigger condition, response timeline, prescribed actions, escalation path, and recovery criteria.
- **Resource Model** — Staffing ratios, time allocation by stage, specialist involvement triggers, and capacity planning thresholds.
- **Handoff Protocol** — Completion criteria checklist, information transfer template, and post-handoff monitoring specifications.
- **Metrics and Reporting** — Onboarding metrics dashboard definition with metric names, calculation methods, targets, and reporting cadence. Include both operational metrics (time-to-milestone, completion rates) and outcome metrics (time-to-value, early churn rate, expansion revenue correlation).
- **Continuous Improvement** — Feedback collection points, analysis cadence, and the process for updating the playbook based on findings.

## Quality Criteria

The playbook is complete and useful when:

- Every stage has measurable exit criteria that do not depend on subjective judgment — a CSM can objectively determine whether a customer has completed a stage
- Milestones are defined as customer actions observable in product analytics, not as CSM activities or calendar dates
- The health score model includes at least four distinct input signals and produces actionable classifications, not just a number
- Intervention playbooks prescribe specific actions with timelines, not just "reach out to the customer"
- The touchpoint sequence is designed for the __ONBOARDING_MODEL__ model specifically — a guided playbook has different touchpoints than a self-serve playbook
- Time-to-value is defined as a specific, measurable customer outcome, not a vague notion of "getting value"
- The handoff protocol ensures no customer falls into a gap between onboarding and ongoing success management
- Resource model includes capacity planning thresholds that indicate when to hire, not just current ratios
- The playbook addresses what happens when a customer's buying champion leaves during onboarding
- Metrics distinguish between leading indicators (predict onboarding success) and lagging indicators (confirm it), and the playbook acts on leading indicators
- The playbook can be executed by a new CSM on their first week — it does not assume institutional knowledge
