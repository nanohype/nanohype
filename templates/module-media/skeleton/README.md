# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createMediaClient } from "./media/index.js";

const client = await createMediaClient("__MEDIA_PROVIDER__");

// Upload an image
const asset = await client.upload(imageBuffer, {
  filename: "hero-banner",
  folder: "marketing",
});

// Get a delivery URL with transforms
const { url } = client.getUrl(asset.id, {
  width: 800,
  height: 600,
  fit: "cover",
  format: "webp",
  quality: 80,
});

console.log(`Delivery URL: ${url}`);

// List assets
const { assets, nextCursor } = await client.list({ maxResults: 20 });
for (const a of assets) {
  console.log(`  ${a.id} (${a.size} bytes)`);
}
```

## TransformBuilder

Fluent immutable API for composing transforms:

```typescript
import { TransformBuilder } from "./media/transforms/builder.js";

const opts = new TransformBuilder()
  .width(200)
  .height(200)
  .fit("cover")
  .format("webp")
  .quality(80)
  .build();

const { url } = client.getUrl(asset.id, opts);
```

## Presets

Named transform presets for common use cases:

```typescript
import { thumbnail, avatar, hero, ogImage } from "./media/transforms/presets.js";

const thumbUrl = client.getUrl(asset.id, thumbnail.options);
const avatarUrl = client.getUrl(asset.id, avatar.options);
const heroUrl = client.getUrl(asset.id, hero.options);
const ogUrl = client.getUrl(asset.id, ogImage.options);
```

| Preset | Dimensions | Fit | Use Case |
|--------|-----------|-----|----------|
| `thumbnail` | 150x150 | cover | Lists and grids |
| `avatar` | 80x80 | cover | User avatars |
| `hero` | 1920x1080 | contain | Hero banners |
| `og-image` | 1200x630 | contain | Open Graph / social share |
| `responsive` | 1920 wide | scale | Responsive srcset base |

## Providers

| Provider | Backend | Auth | Use Case |
|----------|---------|------|----------|
| `cloudinary` | Upload API + URL transforms | `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | Full-featured media pipeline |
| `uploadcare` | REST API + CDN delivery | `UPLOADCARE_PUBLIC_KEY` + `UPLOADCARE_SECRET_KEY` | Simple upload + CDN transforms |
| `imgix` | URL-based transforms (no upload) | `IMGIX_TOKEN` | Transform-only, assets in external source |
| `mock` | In-memory Map | none | Development, testing |

## Custom Providers

Register a new provider factory:

```typescript
import { registerProvider } from "./media/providers/index.js";
import type { MediaProvider } from "./media/providers/types.js";

function createMyProvider(): MediaProvider {
  return {
    name: "my-media",
    async init(config) { /* ... */ },
    async upload(data, options) {
      return { id: "asset-1", size: data.byteLength };
    },
    getUrl(assetId, transforms) {
      return { url: `https://my-cdn.com/${assetId}` };
    },
    async delete(assetId) { /* ... */ },
    async list(options) { return { assets: [] }; },
    async close() { /* ... */ },
  };
}

registerProvider("my-media", createMyProvider);
```

## Architecture

- **Factory-based registry** -- `registerProvider(name, factory)` stores a factory function, and `getProvider(name)` calls it to produce a fresh instance. No module-level mutable state is shared between callers -- each instance has its own API client, circuit breaker, and internal state.
- **Lazy API initialization** -- API clients are created on first use inside each factory closure, not at import time. This avoids side effects from module loading.
- **Per-instance circuit breakers** -- each provider instance gets its own circuit breaker via the factory. Failures in one consumer's provider do not affect other consumers.
- **Native fetch** -- all providers use native fetch (no heavy SDKs). Cloudinary Upload API, Uploadcare REST API, and imgix URL signing are called directly.
- **URL-based transforms** -- providers generate CDN URLs with transform parameters baked in. No server-side processing needed for delivery.
- **Immutable TransformBuilder** -- each method returns a new builder instance. No mutation, safe to share and extend.
- **Named presets** -- common transform configurations (thumbnail, avatar, hero, og-image, responsive) available as constants.
- **OTel metrics** -- upload totals, transform totals, and duration are recorded as OTel counters and histograms. No-ops when no SDK is configured.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.
- **Zod config validation** -- `createMediaClient()` validates configuration at construction time, catching errors early.

## Production Readiness

- [ ] Set API keys for your chosen provider (see `.env.example`)
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Wire in OpenTelemetry SDK for metrics collection
- [ ] Monitor `media_upload_total` and `media_duration_ms` dashboards
- [ ] Set circuit breaker thresholds appropriate for your traffic volume
- [ ] Test failover behavior when the media provider is unavailable
- [ ] Configure eager transforms for frequently-accessed sizes

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

Apache-2.0
