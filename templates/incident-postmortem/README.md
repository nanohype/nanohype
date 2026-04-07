# incident-postmortem

Scaffolds a structured postmortem with incident summary, timeline reconstruction, root cause analysis using the 5 Whys method, impact assessment, and lessons learned. Optionally includes a follow-up action tracker.

## What you get

- A comprehensive postmortem template with incident summary, detection and response timeline, root cause analysis, impact assessment, and lessons learned
- A structured timeline with detection, response, mitigation, and resolution phases
- A follow-up action tracker with owners, due dates, priority, and completion status (conditional)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `ServiceName` | string | (required) | Human-readable service name |
| `IncludeFollowUp` | bool | `true` | Include follow-up action tracker |

## Project layout

```text
postmortem/
  template.md                      # Comprehensive postmortem document
  timeline.yaml                    # Structured incident timeline
  follow-up-tracker.yaml           # Action items with owners (conditional)
```

## Pairs with

- [runbook](../runbook/) -- operational procedures referenced during incidents
- [compliance-checklist](../compliance-checklist/) -- compliance requirements for incident documentation
- [monitoring-stack](../monitoring-stack/) -- observability infrastructure that detects incidents

## Nests inside

- [monorepo](../monorepo/)
