# brief-onboarding-playbook

Scaffolds an agent brief for producing a customer onboarding playbook. The rendered brief instructs an agent to define onboarding stages, set milestone criteria, create health scoring rubrics, design intervention triggers, and produce a playbook that guides customer success teams from signup through time-to-value.

## What you get

- A structured agent brief that produces a customer onboarding playbook
- Stage-by-stage onboarding journey with entry and exit criteria
- Milestone framework based on observable customer actions
- Health score model with predictive risk classification
- Intervention playbooks for common risk patterns
- Resource and capacity model for the specified onboarding approach
- Handoff protocol from onboarding to ongoing success management

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Internal project name |
| `ProductName` | string | (required) | Customer-facing product name |
| `OnboardingModel` | string | `guided` | Onboarding approach |
| `TimeToValue` | string | `30 days` | Target time to first value realization |
| `KeyMilestones` | string | `""` | Comma-separated key milestones |

## Project layout

```text
brief-onboarding-playbook/
  brief.md                         # Agent instruction document
```

## Pairs with

- [onboarding-playbook](../onboarding-playbook/) -- onboarding playbook template
- [qbr-template](../qbr-template/) -- quarterly business review template

## Nests inside

- [monorepo](../monorepo/)
