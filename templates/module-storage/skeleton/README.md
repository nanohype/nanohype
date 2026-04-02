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

## Requirements

- Node.js >= 22
- TypeScript >= 5.8
