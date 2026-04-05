# compliance-checklist

Scaffolds a compliance management package with control inventory, audit trail tracking, and remediation workflows. Supports SOC 2, ISO 27001, HIPAA, and other frameworks through configurable control definitions. Optionally includes evidence collection templates.

## What you get

- A control inventory with categories, owners, and implementation status
- An audit trail tracker for logging assessments and findings
- A remediation tracker for managing control gaps through resolution
- Evidence collection templates with structured guidance (conditional)

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `Framework` | string | no | `soc2` | Compliance framework |
| `IncludeEvidenceTemplates` | bool | no | `true` | Include evidence templates |

## Project layout

```text
compliance/
  controls.yaml                    # Control inventory and status
  audit-trail.yaml                 # Assessment and finding log
  remediation-tracker.yaml         # Gap management through resolution
  evidence/
    collection-template.md         # Evidence gathering guidance (conditional)
```

## Pairs with

- [runbook](../runbook/) -- operational procedures supporting controls
- [module-auth](../module-auth/) -- authentication controls
- [module-observability](../module-observability/) -- logging and monitoring controls

## Nests inside

- [monorepo](../monorepo/)
