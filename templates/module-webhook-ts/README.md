# module-webhook-ts

Composable webhook infrastructure with pluggable signature verification and retry.

## What you get

- Webhook receiver with pluggable signature verification
- Webhook sender with exponential backoff retry and jitter
- Signature provider registry with self-registration pattern
- HMAC-SHA256 and HMAC-SHA1 built-in signature providers
- Timing-safe signature comparison to prevent timing attacks
- Event log interface with in-memory implementation for debugging
- Type-safe event handler dispatch by event type

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `Webhook receiver and sender with retry` | Project description |
| `SignatureMethod` | string | `hmac-sha256` | Default signature method (hmac-sha256/hmac-sha1 or custom) |

## Project layout

```text
<ProjectName>/
  src/
    webhook/
      index.ts              # Main exports — createWebhookReceiver, createWebhookSender
      types.ts              # WebhookConfig, WebhookEvent, WebhookPayload, DeliveryResult, DeliveryOptions
      receiver.ts           # WebhookReceiver — verify signature, parse payload, dispatch handlers
      sender.ts             # WebhookSender — POST with exponential backoff retry
      event-log.ts          # WebhookEventLog interface + in-memory implementation
      signatures/
        types.ts            # SignatureProvider interface
        registry.ts         # Provider registry (register, get, list)
        hmac-sha256.ts      # HMAC-SHA256 using Node crypto, self-registers
        hmac-sha1.ts        # HMAC-SHA1 using Node crypto, self-registers
        index.ts            # Barrel import — triggers self-registration
      __tests__/
        hmac-sha256.test.ts
        sender.test.ts
        registry.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add webhook handling to a service
- [module-queue-ts](../module-queue-ts/) -- queue webhook deliveries for async processing

## Nests inside

- [monorepo](../monorepo/)
