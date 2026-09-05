# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Copy .env.example and configure your API keys
cp .env.example .env

# Install dependencies
npm install

# Process a single image
npm run process -- ./samples/photo.jpg

# Process all files in a directory
npm run process -- ./samples/
```

## Commands

| Command | Description |
|---|---|
| `npm run process` | Detect modality, process, and analyze files |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome |
| `npm run test` | Run tests |
| `npm run eval` | Run the eval suite against a live provider |

## Architecture

The pipeline follows a modular design with pluggable processors and providers:

1. **Modality detection** (`src/pipeline.ts`) -- MIME type analysis determines if input is image, audio, or video
2. **Processing** (`src/processors/`) -- modality-specific handlers prepare content for LLM analysis
3. **LLM analysis** (`src/providers/`) -- vision/audio-capable LLMs analyze processed content
4. **Structured output** (`src/output/`) -- Zod schemas validate and format LLM responses

Processors and providers are registered via self-registering registry patterns:

- **Processors**: Image (sharp resize + base64), Audio (Whisper transcription), Video (ffmpeg frame extraction)
- **LLM Providers**: Anthropic (Claude vision), OpenAI (GPT-4o vision)

### Design Decisions

- **MIME-based routing** -- file extension determines MIME type, MIME type determines modality, modality determines processor. Adding a new format is one registry entry.
- **Self-registering pattern** -- processors and providers register themselves on import via barrel files. No central configuration required.
- **Structured output with fallback** -- LLM responses are parsed as JSON and validated against Zod schemas. If parsing fails, the raw text is wrapped in a minimal valid structure.
- **Provider isolation** -- processors know nothing about LLMs, LLM providers know nothing about processors. The pipeline orchestrator is the only component that connects them.
- **Zod config validation** -- `loadConfig()` parses all environment variables against a typed schema with sensible defaults. Missing or invalid values throw immediately.
- **Frame-based video analysis** -- video is decomposed into JPEG frames at configurable intervals rather than sent as a stream, making it compatible with any vision LLM.

### Evals

`npm run eval` drives the analysis stage over the corpus in `src/eval/cases/`:
golden cases for the routing and summarisation the pipeline exists to do,
adversarial cases for media whose extracted text is trying to redirect it. A
case carries extracted content rather than a media file, so it runs without a
transcription or frame-extraction round trip.

The corpus loader refuses an empty corpus, and refuses a case file it cannot
parse or cannot recognise rather than skipping it — a runner that finds nothing
and exits 0 reports what a passing eval reports. Those refusals are covered by
`npm test`. The eval itself calls a live provider and needs credentials, so it
is a command you run against real credentials rather than one that runs
unattended on every commit.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Configure production API keys for your LLM provider
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Tune `IMAGE_MAX_DIMENSION` for your quality vs. cost tradeoff
- [ ] Set `VIDEO_FRAME_INTERVAL_SECONDS` and `VIDEO_MAX_FRAMES` based on your video lengths
- [ ] Monitor LLM API costs -- image tokens are expensive
- [ ] Install ffmpeg on the system PATH if using video processing
- [ ] Set up alerting on processing failures and latency
- [ ] Run `npm run eval` against the configured provider before shipping a prompt change

## Configuration

All settings are loaded from environment variables. See `.env.example` for the full list.
