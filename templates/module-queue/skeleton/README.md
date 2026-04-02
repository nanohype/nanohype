# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createQueue } from "./queue/index.js";

const queue = await createQueue("__QUEUE_PROVIDER__");

// Enqueue a job
await queue.enqueue("send-email", {
  to: "user@example.com",
  subject: "Hello",
  body: "Welcome aboard!",
});

// Start processing
queue.startWorker({
  "send-email": async (job) => {
    console.log("Sending email to", job.data.to);
    // ... your logic here
  },
});
```

## Providers

| Provider | Backend | Use Case |
|----------|---------|----------|
| `memory` | In-process array | Development, testing |
| `bullmq` | Redis | Production, multi-worker |
| `sqs` | AWS SQS | Cloud-native, serverless |

### Memory

No configuration needed. Jobs are stored in memory and lost on process exit.

### BullMQ

Requires a running Redis instance.

```typescript
const queue = await createQueue("bullmq", {
  connection: { host: "127.0.0.1", port: 6379 },
  queueName: "my-jobs",
});
```

Or set environment variables:

- `REDIS_HOST` (default: `127.0.0.1`)
- `REDIS_PORT` (default: `6379`)
- `QUEUE_NAME` (default: `__PROJECT_NAME__`)

### SQS

Requires an AWS SQS queue and valid AWS credentials.

```typescript
const queue = await createQueue("sqs", {
  queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789/my-queue",
  region: "us-east-1",
  waitTimeSeconds: 20,
  visibilityTimeout: 30,
});
```

Or set environment variables:

- `SQS_QUEUE_URL`
- `AWS_REGION` (default: `us-east-1`)

## Job Options

```typescript
await queue.enqueue("process-image", { url: "..." }, {
  maxRetries: 5,    // default: 3
  delay: 10_000,    // 10s delay before eligible
  priority: 1,      // lower = higher priority
  id: "custom-id",  // optional caller-supplied ID
});
```

## Type-Safe Job Definitions

```typescript
import { defineJob } from "./queue/index.js";

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

const sendEmail = defineJob<EmailPayload>("send-email");

// Enqueue with type checking
await sendEmail(queue.enqueue.bind(queue), {
  to: "user@example.com",
  subject: "Hello",
  body: "Welcome!",
});
```

## Custom Providers

Implement the `QueueProvider` interface and register it:

```typescript
import { registerProvider } from "./queue/providers/index.js";
import type { QueueProvider } from "./queue/providers/index.js";

const myProvider: QueueProvider = {
  name: "my-broker",
  async init(config) { /* ... */ },
  async enqueue(name, data, opts) { /* ... */ return jobId; },
  async dequeue() { /* ... */ return job; },
  async acknowledge(jobId) { /* ... */ },
  async fail(jobId, error) { /* ... */ },
  async close() { /* ... */ },
};

registerProvider(myProvider);
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
