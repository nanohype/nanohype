# module-audit-ledger-ts

An append-only audit ledger with pluggable storage backends. One `AuditLedger` port over four adapters, sharing the registry pattern with the other `module-*-ts` modules.

## What you get

- An `AuditLedger` facade — `append(event)` and `query(contextId)` — over a self-registering adapter registry
- Four adapters:
  - **memory** — in-process, for development and tests (the default)
  - **postgres** — immutable append-only table, `ON CONFLICT DO NOTHING` for idempotent retries
  - **dynamodb** — single-table (`PK=CTX#<id>`, `SK=AUDIT#<ts>#<eventId>`), conditional write for idempotency, TTL, strongly-consistent reads on demand (for read-gates-write checks)
  - **sqs** — at-least-once to a FIFO queue with a DLQ fallback; write-only (a consumer drains it to a queryable store)
- Deterministic, content-addressed event ids so an append is idempotent across all backends
- OTel counters: `audit_append_total` (by provider + result) and `audit_query_total`

**Boundary:** this module owns _persistence only_. Domain logic — approval gates, edit-distance scoring, PII scrubbing — stays in the app that owns the events. Scrub `details` before appending.

## Variables

| Variable        | Placeholder          | Default                   | Description                                                         |
| --------------- | -------------------- | ------------------------- | ------------------------------------------------------------------- |
| `ProjectName`   | `__PROJECT_NAME__`   | —                         | Package name + directory (kebab-case, required)                     |
| `Description`   | `__DESCRIPTION__`    | Append-only audit ledger… | package.json + README description                                   |
| `AuditProvider` | `__AUDIT_PROVIDER__` | `memory`                  | Default backend (memory, postgres, dynamodb, sqs, or a custom name) |

## Project layout

```text
src/audit/
  types.ts                     # AuditEvent, AuditConfig, QueryOptions
  event-id.ts                  # deterministic content-addressed event id (pure)
  index.ts                     # createAuditLedger facade
  bootstrap.ts                 # placeholder guard
  metrics.ts                   # OTel counters
  providers/
    types.ts                   # AuditAdapter port
    registry.ts                # register / get / list
    memory.ts  postgres.ts  dynamodb.ts  sqs.ts
    index.ts                   # barrel (self-registration)
  __tests__/
```

## Pairs with

- `k8s-app-tenant` — deploy the app whose events you're recording
- `ts-service`, `agentic-loop` — the services that emit the events

## Nests inside

- `monorepo`
