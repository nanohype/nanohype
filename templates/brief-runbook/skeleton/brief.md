# Runbook Brief — __PROJECT_NAME__

## Context

You are producing an operational runbook for **__SERVICE_NAME__**, owned by the **__PROJECT_NAME__** team. The service runs on **__INFRA_PROVIDER__** infrastructure. Incident severity levels used by this organization: **__INCIDENT_SEVERITY_LEVELS__**.

A runbook is the operational knowledge base for a service. It exists so that an on-call engineer who has never worked on __SERVICE_NAME__ can diagnose, mitigate, and resolve incidents at 3 AM without escalating unnecessarily. The runbook must be precise, current, and ruthlessly practical. It is not documentation for developers — it is a response manual for operators.

The runbook covers three modes of operation: normal (monitoring, health checks, routine maintenance), degraded (known failure modes with documented remediation), and critical (incident response with escalation paths). Every section must assume the reader is under time pressure and may be unfamiliar with the service internals.

The infrastructure provider (__INFRA_PROVIDER__) determines the operational tooling, access patterns, and failure modes that the runbook must address. AWS failure modes differ from GCP failure modes differ from Fly.io failure modes. Console access, CLI commands, and monitoring integrations should all be __INFRA_PROVIDER__-specific.

The severity levels (__INCIDENT_SEVERITY_LEVELS__) determine the response expectations for each class of incident. The runbook must define what constitutes each severity level for __SERVICE_NAME__ specifically (not just the organization's generic definitions) and what response actions, communication requirements, and escalation paths apply to each.

## Brief

Produce an **operational runbook** for __SERVICE_NAME__.

Your analysis and documentation should cover:

- **Service architecture overview** — Document the service's components, data flows, and external dependencies. Include the runtime environment, deployment topology, and network architecture. This section enables an on-call engineer to build a mental model of the system before diagnosing an issue.
- **Dependency mapping** — Enumerate all upstream and downstream dependencies. For each dependency, document: what __SERVICE_NAME__ uses it for, what happens when it fails, how to verify its health independently, and the owner/contact for escalation. Include both infrastructure dependencies (databases, caches, queues) and service dependencies (APIs, third-party integrations).
- **Health and monitoring** — Define the service's health indicators. Document each alert, what it means, what thresholds trigger it, and the initial response action. Include links to dashboards, log queries, and metric definitions. Specify what "healthy" looks like quantitatively so an operator can confirm recovery.
- **Standard operating procedures** — Document routine operations: deployment, rollback, scaling, configuration changes, certificate rotation, secret rotation, database migrations, and cache invalidation. Each procedure must be step-by-step with exact commands, expected outputs, and verification steps.
- **Incident response procedures** — For each known failure mode, document: symptoms, root cause, diagnosis steps, mitigation steps, resolution steps, and post-incident verification. Organize by severity level using __INCIDENT_SEVERITY_LEVELS__. Include both automated remediation (if available) and manual procedures.
- **Escalation paths** — Define when and how to escalate. For each severity level, specify: response time expectation, communication requirements (who to notify, which channels), escalation criteria (when to involve the next tier), and decision authority (who can authorize risky remediation actions).
- **Disaster recovery** — Document backup locations, restoration procedures, RTO/RPO targets, and failover mechanisms. Include step-by-step procedures for full service restoration from backup.
- **Troubleshooting guides** — Create diagnostic decision trees for common symptoms: high latency, elevated error rates, memory pressure, disk pressure, connection pool exhaustion, and deployment failures. Each tree should lead to either a resolution or a specific escalation action.

## Output Specification

Produce a Markdown document with the following structure:

- **Service Overview** — Architecture diagram description, component inventory, deployment topology, and technology stack. Include environment URLs and access instructions.
- **Dependencies** — Dependency table with columns: dependency name, type (infra/service/external), purpose, failure impact, health check method, owner, and escalation contact.
- **Monitoring and Alerting** — Alert inventory table with columns: alert name, condition, severity, response action, and dashboard link. Include key metric definitions and baseline values.
- **Standard Operating Procedures** — One subsection per procedure (deploy, rollback, scale, rotate credentials, etc.). Each contains numbered steps with exact commands, expected outputs, and rollback instructions if the procedure itself fails.
- **Incident Playbooks** — One subsection per known failure mode. Each contains: severity classification, symptoms, diagnosis steps, mitigation steps, resolution steps, and verification steps. Steps must include exact commands for __INFRA_PROVIDER__.
- **Escalation Matrix** — Table mapping severity levels to response times, communication requirements, escalation criteria, and decision authority.
- **Disaster Recovery** — Backup inventory, RTO/RPO targets, and step-by-step restoration procedures for each recovery scenario.
- **Troubleshooting Decision Trees** — Symptom-based diagnostic flowcharts in text format (using indentation or numbered branches). Each path terminates in a specific action.
- **Contacts and Resources** — Team roster, on-call schedule location, communication channels, vendor support contacts, and links to related documentation.
- **Runbook Maintenance** — Review cadence, update triggers (e.g., after every incident), ownership, and version history.

## Quality Criteria

The runbook is complete and useful when:

- Every procedure includes exact CLI commands with __INFRA_PROVIDER__-specific syntax, not generic descriptions of what to do
- Each command includes the expected output so the operator can verify they are on the right path
- Failure modes include symptoms an operator can observe, not just root causes that require investigation to discover
- The escalation matrix specifies concrete response time targets and communication actions for each severity level in __INCIDENT_SEVERITY_LEVELS__
- Health check definitions include quantitative thresholds — not "the service is slow" but "p99 latency exceeds 500ms for 5 consecutive minutes"
- Disaster recovery procedures have been written as if the reader has no prior access to the system — they include credential retrieval, access provisioning, and environment setup
- Troubleshooting decision trees cover at least five common symptom categories and lead to specific actions, not dead ends
- The runbook distinguishes between mitigation (stop the bleeding) and resolution (fix the root cause) in every incident playbook
- No procedure assumes tribal knowledge — every reference to another system, tool, or dashboard includes the access path
- The runbook includes a maintenance section with a review schedule, because a stale runbook is worse than no runbook
