# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Copy .env.example and point it at your Platform's ModelGateway
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

- **Processors**: Image (sharp resize + base64), Audio (Amazon Transcribe), Video (ffmpeg frame extraction)
- **LLM Providers**: Gateway (Claude vision through the Platform's ModelGateway, the default) and Bedrock (Converse under the AWS credential chain, off the substrate)

### Model access

The `gateway` provider calls the Platform's ModelGateway, the path to a model on the nanohype substrate. The eks-agent-platform operator runs the gateway under the tenant's EKS Pod Identity, holding the Bedrock role, so the pipeline holds no model credential and sends none. `MODEL_GATEWAY_ENDPOINT` is the gateway root, as ModelGateway `status.endpoint` publishes it, and defaults to the Service the operator creates for the Platform named at scaffold time; `MODEL_ROUTE` (`default`) names the route the ModelGateway maps to a Bedrock model.

The `bedrock` provider calls Bedrock's Converse API directly under the IAM role the AWS SDK's default credential chain resolves: a task or execution role in AWS, or an AWS profile such as an IAM Identity Center sign-in on a workstation. `LLM_MODEL` names its model as an inference-profile ID, and `AWS_REGION` the region. On the substrate a direct call skips the route's guardrail and rate limit, so a tenant stays on `gateway`.

The ModelGateway serves no transcription route, so audio processing runs off the substrate, with `LLM_PROVIDER=bedrock`. The audio processor stages each file under `TRANSCRIBE_S3_URI`, runs an Amazon Transcribe batch job over it under the same credential chain, reads the transcript back, and deletes both objects. The role needs `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` under that prefix, and `transcribe:StartTranscriptionJob` and `transcribe:GetTranscriptionJob`. No component holds a provider key.

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
`npm test`. The eval itself calls a live provider, so it is a command you run
against a reachable ModelGateway, or Bedrock off the substrate, rather
than one that runs unattended on every commit.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Point `MODEL_GATEWAY_ENDPOINT` and `MODEL_ROUTE` at the Platform's ModelGateway and the route it maps to a vision-capable model; off the substrate, run `bedrock` under an IAM role with `LLM_MODEL` set to a vision-capable inference profile
- [ ] With audio processing, set `TRANSCRIBE_S3_URI` to a prefix the role can write, read and delete under, with a lifecycle rule that expires what a crashed run leaves behind
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Tune `IMAGE_MAX_DIMENSION` for your quality vs. cost tradeoff
- [ ] Set `VIDEO_FRAME_INTERVAL_SECONDS` and `VIDEO_MAX_FRAMES` based on your video lengths
- [ ] Monitor LLM API costs -- image tokens are expensive
- [ ] Install ffmpeg on the system PATH if using video processing
- [ ] Set up alerting on processing failures and latency
- [ ] Run `npm run eval` against the configured provider before shipping a prompt change

## Configuration

All settings are loaded from environment variables. See `.env.example` for the full list.
