# __PROJECT_NAME__

__DESCRIPTION__

Composable blob storage module with pluggable backends. Supports local filesystem, AWS S3, Cloudflare R2, and Google Cloud Storage out of the box.

## Quick Start

```typescript
import { createStorageClient } from "./storage/index.js";

// Create a client with the default provider (__STORAGE_PROVIDER__)
const storage = await createStorageClient("__STORAGE_PROVIDER__", {
  // Provider-specific config goes here
  basePath: "./data",       // local provider
  // bucket: "my-bucket",   // s3/r2/gcs
});

// Upload
await storage.upload("docs/hello.txt", "Hello, world!", {
  contentType: "text/plain",
});

// Download
const data = await storage.download("docs/hello.txt");
console.log(data.toString()); // "Hello, world!"

// List
const { objects } = await storage.list("docs/");

// Signed URL
const url = await storage.getSignedUrl("docs/hello.txt", 3600);

// Delete
await storage.delete("docs/hello.txt");
```

## Providers

### Local (filesystem)

```typescript
const storage = await createStorageClient("local", {
  basePath: "./uploads",
});
```

### AWS S3

```typescript
const storage = await createStorageClient("s3", {
  bucket: "my-bucket",
  region: "us-east-1",
});
```

Credentials are resolved via the standard AWS credential chain (environment variables, `~/.aws/credentials`, IAM role).

### Cloudflare R2

```typescript
const storage = await createStorageClient("r2", {
  bucket: "my-bucket",
  accountId: "your-cloudflare-account-id",
  accessKeyId: "your-r2-access-key",
  secretAccessKey: "your-r2-secret-key",
});
```

### Google Cloud Storage

```typescript
const storage = await createStorageClient("gcs", {
  bucket: "my-bucket",
  projectId: "my-gcp-project",       // optional if resolvable
  keyFilename: "./service-account.json", // optional if using ADC
});
```

## Custom Providers

Implement the `StorageProvider` interface and register it:

```typescript
import { registerProvider } from "./storage/providers/registry.js";
import type { StorageProvider } from "./storage/providers/types.js";

class MyProvider implements StorageProvider {
  readonly name = "my-provider";
  // ... implement all methods
}

registerProvider(new MyProvider());
```

Then use it by name:

```typescript
const storage = await createStorageClient("my-provider", { /* config */ });
```

## Architecture

- **StorageClient wrapper** -- `createStorageClient()` initializes a provider by name and returns a `StorageClient` that delegates all operations (upload, download, delete, list, getSignedUrl) to the underlying provider. Application code never touches provider internals.
- **Provider registry with self-registration** -- each provider module (local, s3, r2, gcs) calls `registerProvider()` at import time. The barrel import ensures all built-in providers are available. Adding a custom provider is one class + one `registerProvider()` call.
- **`toBuffer` with size limits** -- the shared `toBuffer()` helper collects `UploadData` (Buffer, Uint8Array, string, or Readable stream) into a single Buffer with a configurable maximum size (default 100 MB). Streams are checked incrementally -- if the limit is exceeded mid-stream, the stream is destroyed immediately.
- **`withRetry` exponential backoff** -- cloud operations use `withRetry()` which retries on transient network errors (ECONNRESET, ETIMEDOUT, 429, 5xx) with exponential backoff and jitter. Non-retryable errors propagate immediately.
- **Zod input validation** -- `createStorageClient()` validates its arguments against a schema before resolving the provider, catching configuration errors at construction time.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.
- **Credential resolution per provider** -- S3 uses the standard AWS credential chain, GCS uses Application Default Credentials or a service account key file, R2 uses explicit access keys. Each provider handles its own auth.

## Production Readiness

- [ ] Set provider-specific environment variables or credentials (AWS, GCS, R2)
- [ ] Choose a cloud provider (s3, r2, gcs) -- local provider is for development only
- [ ] Configure bucket names and regions for your environment
- [ ] Review and tune `toBuffer` size limit for your upload workloads
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Enable signed URL expiration appropriate for your use case
- [ ] Monitor upload/download error rates and latency
- [ ] Configure bucket lifecycle policies (expiration, storage class transitions)
- [ ] Restrict IAM / service account permissions to the minimum required operations

## Requirements

- Node.js >= 22
- TypeScript >= 5.8
