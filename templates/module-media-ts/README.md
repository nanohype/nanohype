# module-media-ts

Media processing and delivery with pluggable providers.

## What you get

- Factory-based provider registry with self-registering media backends
- Cloudinary provider (Upload API + URL-based transforms, native fetch, signature auth)
- Uploadcare provider (REST API + CDN delivery with on-the-fly URL transforms)
- imgix provider (URL-based transforms with signed URLs and responsive srcset generation)
- In-memory mock provider with fake URLs for testing
- Fluent immutable TransformBuilder for composing transform options
- Named transform presets (thumbnail, avatar, hero, og-image, responsive)
- Per-instance circuit breakers for resilience
- OTel metrics (upload totals, transform totals, duration)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Media processing and delivery with pluggable providers` | Project description |
| `MediaProvider` | string | `cloudinary` | Default media provider (cloudinary/uploadcare/imgix/mock or custom) |

## Project layout

```text
<ProjectName>/
  src/
    media/
      index.ts              # Main exports -- createMediaClient facade with OTel metrics
      types.ts              # MediaAsset, UploadOptions, TransformOptions, DeliveryUrl
      config.ts             # Zod-validated configuration
      bootstrap.ts          # Placeholder detection guard
      logger.ts             # Structured JSON logger
      metrics.ts            # OTel counters and histograms
      providers/
        types.ts            # MediaProvider interface + factory type
        registry.ts         # Factory-based provider registry
        cloudinary.ts       # Cloudinary Upload API + URL transforms
        uploadcare.ts       # Uploadcare REST API + CDN delivery
        imgix.ts            # imgix URL-based transforms + srcset
        mock.ts             # In-memory mock with fake URLs
        index.ts            # Barrel import -- triggers self-registration
      transforms/
        presets.ts          # Named transform presets
        builder.ts          # Fluent immutable TransformBuilder
      resilience/
        circuit-breaker.ts  # Circuit breaker state machine
        __tests__/
          circuit-breaker.test.ts
      __tests__/
        registry.test.ts
        mock.test.ts
        presets.test.ts
        builder.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add media processing to a service
- [next-app](../next-app/) -- image optimization and delivery
- [module-storage-ts](../module-storage-ts/) -- store original files, deliver via media CDN

## Nests inside

- [monorepo](../monorepo/)
