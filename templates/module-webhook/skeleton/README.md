# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createWebhookReceiver, createWebhookSender } from "./webhook/index.js";

// ── Receiving Webhooks ─────────────────────────────────────────────

const receiver = createWebhookReceiver({
  secret: process.env.WEBHOOK_SECRET!,
  signatureMethod: "__SIGNATURE_METHOD__",
});

receiver.on("push", async (event) => {
  console.log("Received push event:", event.payload);
});

// In your HTTP handler:
const result = await receiver.handleRequest(rawBody, headers);
// result.verified — whether the signature was valid
// result.event   — the parsed WebhookEvent (if verified)

// ── Sending Webhooks ───────────────────────────────────────────────

const sender = createWebhookSender({
  secret: process.env.WEBHOOK_SECRET!,
  signatureMethod: "__SIGNATURE_METHOD__",
  maxRetries: 5,
  baseDelay: 1000,
});

const delivery = await sender.send("https://example.com/webhook", {
  event: "deploy.completed",
  payload: { app: "my-app", version: "1.2.0" },
});
// delivery.ok       — final success/failure
// delivery.attempts — number of attempts made
```

## Signature Providers

| Provider | Algorithm | Use Case |
|----------|-----------|----------|
| `hmac-sha256` | HMAC-SHA256 | Default, most services (GitHub, Stripe) |
| `hmac-sha1` | HMAC-SHA1 | Legacy services |

## Event Log

The built-in event log records all received and sent webhook events for debugging:

```typescript
import { InMemoryEventLog } from "./webhook/event-log.js";

const log = new InMemoryEventLog();
const receiver = createWebhookReceiver({
  secret: "s3cret",
  signatureMethod: "hmac-sha256",
  eventLog: log,
});

// After processing some webhooks...
const recent = log.list({ limit: 10 });
```

## Custom Signature Providers

Implement the `SignatureProvider` interface and register it:

```typescript
import { registerSignatureProvider } from "./webhook/signatures/index.js";
import type { SignatureProvider } from "./webhook/signatures/index.js";

const myProvider: SignatureProvider = {
  name: "my-custom-hmac",
  sign(payload, secret) { /* ... */ return signature; },
  verify(payload, signature, secret) { /* ... */ return isValid; },
};

registerSignatureProvider(myProvider);
```

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm start       # run compiled output
```

## License

MIT
