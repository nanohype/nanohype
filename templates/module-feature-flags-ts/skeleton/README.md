# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createFlagService } from "./feature-flags/index.js";

const flags = await createFlagService({ storeName: "__FLAG_STORE__" });

// Create a flag with percentage rollout
await flags.setFlag({
  key: "new-checkout",
  name: "New Checkout Flow",
  enabled: true,
  type: "boolean",
  variants: [
    { name: "control", value: false },
    { name: "treatment", value: true },
  ],
  rules: [
    { type: "percentage", percentage: 50, variant: "treatment" },
  ],
  defaultVariant: "control",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Evaluate the flag for a user
const result = await flags.evaluate("new-checkout", { userId: "user-42" });
console.log(result.variant, result.value); // deterministic per userId
```

## Stores

| Store | Backend | Use Case |
|-------|---------|----------|
| `memory` | In-process Map | Development, testing |
| `redis` | Redis | Production, distributed |
| `json-file` | JSON file | Config-driven, version controlled |
| `mock` | Seeded Map | Testing with deterministic flags |

### Memory

No configuration needed. Flags are stored in memory and lost on process exit.

### Redis

Requires a running Redis instance.

```typescript
const flags = await createFlagService({
  storeName: "redis",
  storeConfig: { host: "127.0.0.1", port: 6379 },
});
```

Or set environment variables:

- `REDIS_URL` (full connection string, takes precedence)
- `REDIS_HOST` (default: `127.0.0.1`)
- `REDIS_PORT` (default: `6379`)

### JSON File

```typescript
const flags = await createFlagService({
  storeName: "json-file",
  storeConfig: { filePath: "./flags.json" },
});
```

Or set `FLAGS_FILE_PATH` environment variable.

## Targeting Rules

Rules are evaluated in order — first match wins.

### Percentage Rollout

Deterministic bucketing via FNV-1a hash of `flagKey:userId`. The same user always sees the same variant for a given flag.

```typescript
{ type: "percentage", percentage: 50, variant: "treatment" }
```

### User Allowlist

Explicit user ID list that bypasses percentage logic.

```typescript
{ type: "allowlist", userIds: ["user-1", "user-2"], variant: "treatment" }
```

### Property Matching

Compare a context property against a value using standard operators (`eq`, `neq`, `in`, `not_in`, `gt`, `lt`, `gte`, `lte`).

```typescript
{
  type: "property",
  property: "plan",
  operator: "eq",
  compareValue: "enterprise",
  variant: "treatment",
}
```

## Variant Tracking

The flag service records every evaluation for observability pairing. Records are buffered and flushed via a configurable callback.

```typescript
const flags = await createFlagService({
  storeName: "memory",
  enableTracking: true,
});

// Records are buffered automatically
const result = await flags.evaluate("new-checkout", { userId: "user-42" });

// Flush manually or let the buffer auto-flush at capacity
await flags.tracker?.flush();
```

## Architecture

- **Flag service facade** -- `createFlagService()` returns a high-level `FlagService` object that wraps store access, rule evaluation, and variant tracking behind a single API.
- **Factory-based store registry** -- each store module registers a factory function. `getStore()` calls the factory to produce a fresh instance, ensuring no module-level mutable state is shared.
- **Deterministic percentage rollout** -- FNV-1a hash of `flagKey:userId` maps each user to a stable bucket in [0, 100). Same inputs always produce the same variant.
- **First-match rule evaluation** -- rules are checked in order. The first rule whose conditions match the targeting context determines the variant. If no rules match, the default variant is returned.
- **Variant tracking** -- every evaluation is recorded with flag key, variant, user ID, and timestamp. Records buffer in memory and flush via a configurable callback for downstream analytics.
- **Zod input validation** -- `createFlagService()` validates its arguments against a schema before initializing the store, catching misconfiguration at construction time.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any store initialization.

## Production Readiness

- [ ] Set all environment variables (`REDIS_URL` or `FLAGS_FILE_PATH`)
- [ ] Choose a persistent store (redis or json-file) -- memory store loses data on restart
- [ ] Configure variant tracking flush callback to send records to your analytics pipeline
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor flag evaluation latency and hit patterns via OTel metrics
- [ ] Test flag evaluation edge cases -- disabled flags, missing users, unknown properties

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

MIT
