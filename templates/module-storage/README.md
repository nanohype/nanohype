# module-storage

Composable blob storage abstraction with pluggable backends for local filesystem, AWS S3, Cloudflare R2, and Google Cloud Storage.

## What you get

- StorageProvider interface with upload, download, delete, list, and signed URL operations
- Self-registering provider pattern for extensibility
- Local filesystem provider with recursive directory walking
- AWS S3 provider via @aws-sdk/client-s3
- Cloudflare R2 provider (S3-compatible with custom endpoint)
- Google Cloud Storage provider via @google-cloud/storage
- High-level StorageClient wrapper with factory function
- Stream support for large file handling

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `A composable blob storage module` | Project description |
| `StorageProvider` | string | `local` | Default storage backend (local/s3/r2/gcs or custom) |

## Project layout

```text
<ProjectName>/
  src/
    storage/
      index.ts              # Main export -- createStorageClient(config)
      types.ts              # StorageObject, UploadOptions, ListOptions
      client.ts             # High-level client wrapping the provider
      providers/
        types.ts            # StorageProvider interface
        registry.ts         # Provider registry
        local.ts            # Local filesystem provider
        s3.ts               # AWS S3 provider
        r2.ts               # Cloudflare R2 provider
        gcs.ts              # Google Cloud Storage provider
        index.ts            # Barrel import + re-exports
  package.json
  tsconfig.json
  README.md
```

## Pairs with

- [ts-service](../ts-service/) -- add storage to an HTTP service
- [rag-pipeline](../rag-pipeline/) -- store documents and embeddings
- [agentic-loop](../agentic-loop/) -- persist agent artifacts

## Nests inside

- [monorepo](../monorepo/)
