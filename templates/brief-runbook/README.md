# brief-runbook

Scaffolds an agent brief for producing an operational runbook. The rendered brief instructs an agent to analyze a service's architecture, document dependencies, create step-by-step procedures, define escalation paths, and produce a runbook suitable for on-call engineers.

## What you get

- A structured agent brief that produces an operational runbook
- Service architecture overview with dependency mapping
- Alert inventory with response actions and dashboard links
- Step-by-step standard operating procedures with exact commands
- Incident playbooks organized by severity level
- Troubleshooting decision trees for common symptom categories
- Disaster recovery procedures with RTO/RPO targets

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Project or team that owns the service |
| `ServiceName` | string | yes | - | Name of the service |
| `InfraProvider` | string | no | `aws` | Primary infrastructure provider |
| `IncidentSeverityLevels` | string | no | `P1,P2,P3,P4` | Comma-separated severity levels |

## Project layout

```text
brief-runbook/
  brief.md                         # Agent instruction document
```

## Pairs with

- [runbook](../runbook/) -- runbook template
- [monitoring-stack](../monitoring-stack/) -- monitoring infrastructure

## Nests inside

- [monorepo](../monorepo/)
