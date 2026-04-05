# runbook

Scaffolds an operations runbook with service overview, dependency map, operational procedures, and escalation paths. Optionally includes an incident response playbook. Designed for on-call engineers and SRE teams managing production services.

## What you get

- A service overview document with architecture context and ownership
- A dependency map with upstream/downstream services and health endpoints
- Operational procedures for common tasks (deploys, rollbacks, scaling)
- An escalation matrix with severity levels, contacts, and SLAs
- An incident response playbook with severity classification and communication templates (conditional)

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `ServiceName` | string | yes | - | Human-readable service name |
| `IncludeIncidentResponse` | bool | no | `true` | Include incident response playbook |
| `OnCallTool` | string | no | `pagerduty` | On-call management tool |

## Project layout

```text
runbook/
  overview.md                      # Service architecture and ownership
  dependencies.yaml                # Upstream/downstream service map
  procedures.md                    # Operational procedures
  escalation.yaml                  # Severity levels, contacts, SLAs
  incident-response.md             # Incident playbook (conditional)
```

## Pairs with

- [compliance-checklist](../compliance-checklist/) -- compliance controls for the service
- [monitoring-stack](../monitoring-stack/) -- observability infrastructure
- [infra-aws](../infra-aws/) -- AWS infrastructure
- [infra-gcp](../infra-gcp/) -- GCP infrastructure

## Nests inside

- [monorepo](../monorepo/)
