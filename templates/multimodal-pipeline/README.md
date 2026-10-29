# multimodal-pipeline

Scaffolds a multimodal processing pipeline in TypeScript. Accepts image, audio, and video inputs, routes each through modality-specific processors, sends processed content to a vision-capable LLM through the Platform's ModelGateway, and returns Zod-validated structured output. The pipeline holds no model credential: the gateway does. Off the substrate, a Bedrock provider and Amazon Transcribe run under the AWS credential chain, so no component holds a provider key. Every component is built from first principles: a model call goes to the ModelGateway over `fetch`, and Bedrock, Transcribe and S3 are reached through the AWS SDK.

## What you get

- **Automatic modality detection** — MIME type and extension-based routing to the correct processor
- **Image processing** — base64 encoding for vision LLM analysis with configurable detail levels
- **Audio processing** — Amazon Transcribe transcription under the AWS credential chain, staged through S3, followed by LLM analysis (conditional; the ModelGateway serves no transcription route, so it runs off the substrate)
- **Video processing** — frame extraction at configurable intervals for sequential vision analysis (conditional)
- **LLM provider registry** — the `gateway` provider (Claude vision through the Platform's ModelGateway, no credential) and the `bedrock` provider (Converse under the AWS credential chain, off the substrate), self-registering
- **Structured output** — Zod schema validation on LLM responses with typed result objects
- **Processor registry** — pluggable processor pattern for adding new modalities

## Variables

| Variable       | Type   | Default                            | Description                                                                   |
| -------------- | ------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `ProjectName`  | string | _(required)_                       | Kebab-case project name                                                       |
| `Description`  | string | "A multimodal processing pipeline" | Project description                                                           |
| `LlmProvider`  | string | `gateway`                          | gateway on the substrate, bedrock off it, mock, or a custom name              |
| `PlatformName` | string | `${ProjectName}`                   | Platform CR the pipeline deploys under; sets the gateway's endpoint           |
| `IncludeAudio` | bool   | `false`                            | Include audio processing support, through Amazon Transcribe off the substrate |
| `IncludeVideo` | bool   | `false`                            | Include video processing support                                              |
| `IncludeTests` | bool   | `true`                             | Include vitest test suite                                                     |

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
      bedrock.ts                   # Bedrock Converse provider, AWS credential chain
      mock.ts                      # Deterministic provider for tests
      transcribe.ts                # Amazon Transcribe transcription (conditional)
      index.ts                     # Barrel import + re-exports
    output/
      types.ts                     # Structured output Zod schemas
      formatter.ts                 # Output validation and formatting
    __tests__/
      pipeline.test.ts             # Pipeline orchestration tests (conditional)
      image.test.ts                # Image processor tests (conditional)
      gateway.test.ts              # gateway against an in-process HTTP server (conditional)
      bedrock.test.ts              # bedrock against an in-process HTTP/2 server (conditional)
      transcribe.test.ts           # Transcribe and S3 clients in-process (conditional)
      config.test.ts               # AUDIO_TRANSCRIPTION_TIMEOUT_MS parse
      cli.test.ts                  # How a failed run exits
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
