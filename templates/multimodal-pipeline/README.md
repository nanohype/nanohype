# multimodal-pipeline

Scaffolds a multimodal processing pipeline in TypeScript. Accepts image, audio, and video inputs, routes each through modality-specific processors, sends processed content to vision/audio-capable LLMs, and returns Zod-validated structured output. All components built from first principles using provider SDKs directly.

## What you get

- **Automatic modality detection** — MIME type and extension-based routing to the correct processor
- **Image processing** — base64 encoding for vision LLM analysis with configurable detail levels
- **Audio processing** — Whisper transcription followed by LLM analysis (conditional)
- **Video processing** — frame extraction at configurable intervals for sequential vision analysis (conditional)
- **LLM provider registry** — Anthropic Claude vision, OpenAI GPT-4o vision with self-registration
- **Structured output** — Zod schema validation on LLM responses with typed result objects
- **Processor registry** — pluggable processor pattern for adding new modalities

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | "A multimodal processing pipeline" | Project description |
| `LlmProvider` | string | `anthropic` | anthropic or openai |
| `IncludeAudio` | bool | `true` | Include audio processing support |
| `IncludeVideo` | bool | `false` | Include video processing support |
| `IncludeTests` | bool | `true` | Include vitest test suite |

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
      anthropic.ts                 # Anthropic Claude vision provider
      openai.ts                    # OpenAI GPT-4o vision provider
      index.ts                     # Barrel import + re-exports
    output/
      types.ts                     # Structured output Zod schemas
      formatter.ts                 # Output validation and formatting
    __tests__/
      pipeline.test.ts             # Pipeline orchestration tests (conditional)
      image.test.ts                # Image processor tests (conditional)
  package.json
  tsconfig.json
  eslint.config.js
  vitest.config.ts
  .env.example
  .prettierrc
  .gitignore
  README.md
```

## Pairs with

- [agentic-loop](../agentic-loop/) — add an agent layer that uses multimodal analysis as a tool
- [rag-pipeline](../rag-pipeline/) — combine with RAG for multimodal document understanding
- [eval-harness](../eval-harness/) — benchmark multimodal analysis accuracy

## Nests inside

- [monorepo](../monorepo/)
