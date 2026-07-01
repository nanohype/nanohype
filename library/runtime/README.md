# @nanohype/runtime

Zero-dependency TypeScript runtime primitives, maintained here as the single
source of truth and **vendored** into consumers — the same consumption model
as the `tenant-chart-base` library chart.

## Modules

| Module | What it is |
| --- | --- |
| `src/circuit-breaker.ts` | Pure, timer-less sliding-window circuit breaker with an injectable `now()` clock, single half-open probe, `onOpen` trip hook, and operator `reset()` |
| `src/resilience.ts` | `withTimeout` (deadline race → `TimeoutError`) and `withRetry` (jittered exponential backoff, injectable sleep) |
| `src/registry.ts` | `createRegistry<T>` — the provider-registry convention for pluggable seams (LLM, embeddings, vector stores, aggregators) |
| `src/workos-directory.ts` | Typed WorkOS Directory Sync client: port-injected `fetch`, bounded cursor pagination, find-by-email / custom-attribute / group / created-since |
| `src/pii.ts` | PII redaction over the union category set: secrets and tokens, SSN and cards, compensation, HR cases, health, DOB, contact info, AWS accounts, customer and infrastructure identifiers |

Every module is dependency-free (native `fetch` types only) and side-effect
free at import time. Observability is deliberately left to the consumer: the
breaker exposes `onOpen`, the redactor returns structured findings — wire
them into whatever logger and metrics surface the consuming app has.

## Consumption model: vendor and sync

Consumers do not install this as a package. They **copy the module files they
need** into their own source tree (tests optionally alongside), because
standalone templates and tenant apps must stay self-contained — there is no
shared package registry between them at runtime.

The contract, mirroring `tenant-chart-base`:

1. **This directory is the single source of truth.** Behavior changes land
   here first, with their tests.
2. **Copies are byte-identical to their source module.** A vendored copy
   carries the module header intact so its provenance is greppable.
3. **Fixes propagate outward, never inward.** If a bug is found in a vendored
   copy, fix it here and re-copy — a copy that drifts from the source is the
   defect, exactly as `scripts/sync-library.mjs --check` treats a drifted
   chart copy.

When in-repo templates adopt these modules, extend `scripts/sync-library.mjs`
so CI enforces the copies the same way it enforces the vendored chart.

## Development

```sh
cd library/runtime
npm install
npm run typecheck    # tsc --noEmit, strict + exactOptionalPropertyTypes
npm test             # vitest — full coverage colocated per module (src/*.test.ts)
```

## Design notes

- **Breaker semantics.** Sliding-window failure accounting was chosen over
  consecutive-counter and timer-driven designs: old failures decay naturally,
  no timers are held, and every time read goes through the injected `now()`
  so tests tick a fake clock synchronously. See the header of
  `src/circuit-breaker.ts`.
- **PII catalog.** Patterns are ordered most-specific first, replacements are
  typed per label (`[JWT]`, `[SSN]`, `[COMPENSATION]`, …), and non-dashed
  9-digit SSNs are deliberately not matched — the false-positive rate against
  legitimate account numbers is unacceptable for a raw regex. See the header
  of `src/pii.ts`.
- **WorkOS pagination.** `/directory_users` does not support server-side
  filtering by email or custom attribute, so the finders paginate and scan
  client-side, bounded at `maxPages` (default 50). Caching is the caller's
  concern — fleet consumers front the client with their own TTL caches.
