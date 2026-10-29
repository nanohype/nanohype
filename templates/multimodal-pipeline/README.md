# multimodal-pipeline

Scaffolds a multimodal processing pipeline in TypeScript. Accepts image, audio, and video inputs, routes each through modality-specific processors, sends processed content to a vision-capable LLM through the Platform's ModelGateway, and returns Zod-validated structured output. The pipeline holds no model credential: the gateway does. All components built from first principles using provider SDKs directly.

## What you get

- **Automatic modality detection** — MIME type and extension-based routing to the correct processor
- **Image processing** — base64 encoding for vision LLM analysis with configurable detail levels
- **Audio processing** — Whisper transcription followed by LLM analysis (conditional; transcription calls OpenAI with a provider key, so it is off the substrate only)
- **Video processing** — frame extraction at configurable intervals for sequential vision analysis (conditional)
- **LLM provider registry** — the `gateway` provider (Claude vision through the Platform's ModelGateway, no credential), with Anthropic Claude vision and OpenAI GPT-4o vision behind `IncludeKeyProviders` for use off the substrate, all self-registering
- **Structured output** — Zod schema validation on LLM responses with typed result objects
- **Processor registry** — pluggable processor pattern for adding new modalities

## Variables

| Variable              | Type   | Default                            | Description                                                         |
| --------------------- | ------ | ---------------------------------- | ------------------------------------------------------------------- |
| `ProjectName`         | string | _(required)_                       | Kebab-case project name                                             |
| `Description`         | string | "A multimodal processing pipeline" | Project description                                                 |
| `LlmProvider`         | string | `gateway`                          | gateway, or off the substrate anthropic or openai                   |
| `PlatformName`        | string | `ProjectName`                      | Platform CR the pipeline deploys under; sets the gateway's endpoint |
| `IncludeAudio`        | bool   | `false`                            | Include audio processing support (off the substrate only)           |
| `IncludeVideo`        | bool   | `false`                            | Include video processing support                                    |
| `IncludeTests`        | bool   | `true`                             | Include vitest test suite                                           |
| `IncludeKeyProviders` | bool   | `false`                            | Include the API-key providers, for use off the substrate only       |

## Project layout

```text
<ProjectName>/
  src/
    index.ts                       # CLI entry — process files or directories
    pipeline.ts                    # Pipeline orchestrator with modality detection
    config.ts                      # Zod-validated config from env vars
    logger.ts                      # Structured JSON logger
    bootstrap.ts                   # Placeholder validation
    processors/
      types.ts                     # Processor interface and shared types
      registry.ts                  # Processor registry (register/get/list)
      image.ts                     # Image processor (base64 + vision LLM)
      audio.ts                     # Audio processor (transcription + LLM) (conditional)
      video.ts                     # Video processor (frame extraction + LLM) (conditional)
      index.ts                     # Barrel import + re-exports
    providers/
      types.ts                     # LLM provider interface
      registry.ts                  # LLM provider registry
      gateway.ts                   # Platform ModelGateway provider, no credential
      anthropic.ts                 # Anthropic Claude vision provider (IncludeKeyProviders)
      openai.ts                    # OpenAI GPT-4o vision provider (IncludeKeyProviders)
      whisper.ts                   # OpenAI Whisper transcription
      index.ts                     # Barrel import + re-exports
    output/
      types.ts                     # Structured output Zod schemas
      formatter.ts                 # Output validation and formatting
    __tests__/
      pipeline.test.ts             # Pipeline orchestration tests (conditional)
      image.test.ts                # Image processor tests (conditional)
  package.json
  tsconfig.json
  biome.json
  vitest.config.ts
  .env.example
  .gitignore
  README.md
```

## Pairs with

- [agentic-loop](../agentic-loop/) — add an agent layer that uses multimodal analysis as a tool
- [rag-pipeline](../rag-pipeline/) — combine with RAG for multimodal document understanding
- [eval-harness](../eval-harness/) — benchmark multimodal analysis accuracy

## Nests inside

- [monorepo](../monorepo/)
