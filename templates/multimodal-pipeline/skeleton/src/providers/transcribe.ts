import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  GetTranscriptionJobCommand,
  type LanguageCode,
  type MediaFormat,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from "@aws-sdk/client-transcribe";
import { z } from "zod";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// ── Amazon Transcribe Provider ──────────────────────────────────────
//
// Speech to text for the audio processor, through Amazon Transcribe under
// the IAM role the AWS SDK's default credential chain resolves: an ECS task
// role, a Lambda execution role, or on a workstation the AWS profile the
// environment selects. The pipeline holds no provider key. The Platform's
// ModelGateway serves no transcription route, so audio processing runs off
// the nanohype substrate.
//
// Transcribe reads its media from S3 and writes its transcript there, so a
// call stages the file under the prefix TRANSCRIBE_S3_URI names, as
// `<prefix>/<job>/media/<file>`, starts a batch job whose transcript lands
// at `<prefix>/<job>/transcript.json`, polls the job until it completes or
// fails, and reads the transcript back. Both objects are deleted once the
// call settles. The role needs s3:PutObject, s3:GetObject and
// s3:DeleteObject under the prefix, and transcribe:StartTranscriptionJob
// and transcribe:GetTranscriptionJob.
//
// AUDIO_LANGUAGE_CODE fixes the language (`en-US`); unset, Transcribe
// identifies it and the result reports the one it found. A call fails when
// the job has not finished within AUDIO_TRANSCRIPTION_TIMEOUT_MS, and runs
// through the provider's circuit breaker.
//

/** How long a call waits on its job when the settings give no timeout, in milliseconds. */
export const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 900_000;

/** How long a call waits between reads of its job's status, in milliseconds. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** The region Transcribe and S3 are called in when AWS_REGION is unset or empty. */
export const DEFAULT_AWS_REGION = "us-east-1";

/** The Transcribe media format for each audio MIME type the audio processor accepts. */
export const MEDIA_FORMATS: Record<string, MediaFormat> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
};

/** Result returned by the transcription provider. */
export interface TranscriptionResult {
  text: string;
  /** The end of the last word spoken, in seconds. */
  duration?: number;
  language?: string;
}

/** Where a transcription stages its files, and how it runs. */
export interface TranscriptionSettings {
  /** The `s3://bucket/prefix` the media and transcript are staged under. */
  s3Uri: string;
  /** The language the audio is in. Transcribe identifies it when unset. */
  languageCode?: string;
  /** How long a call waits on its job, in milliseconds. DEFAULT_TRANSCRIPTION_TIMEOUT_MS when unset. */
  timeoutMs?: number;
}

/** Interface for audio transcription providers. */
export interface TranscriptionProvider {
  transcribe(
    filePath: string,
    mimeType: string,
    settings: TranscriptionSettings,
  ): Promise<TranscriptionResult>;
}

const transcriptionProviders = new Map<string, () => TranscriptionProvider>();

export function registerTranscriptionProvider(
  name: string,
  factory: () => TranscriptionProvider,
): void {
  transcriptionProviders.set(name, factory);
}

export function getTranscriptionProvider(name: string): TranscriptionProvider {
  const factory = transcriptionProviders.get(name);
  if (!factory) {
    const available = [...transcriptionProviders.keys()].join(", ") || "(none)";
    throw new Error(`Unknown transcription provider "${name}". Registered: ${available}`);
  }
  return factory();
}

/** The part of an AWS SDK client a provider calls. */
export interface CommandClient {
  send(command: object): Promise<unknown>;
}

export interface TranscribeProviderOptions {
  /** The Transcribe client. A TranscribeClient on the default credential chain when unset. */
  transcribe?: CommandClient;
  /** The S3 client. An S3Client on the default credential chain when unset. */
  s3?: CommandClient;
  /** How long a call waits between reads of its job's status, in milliseconds. */
  pollIntervalMs?: number;
}

/** The bucket and key prefix an `s3://bucket/prefix` URI names; the prefix has no trailing slash. */
export function parseS3Uri(uri: string): { bucket: string; prefix: string } {
  const match = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/.exec(uri);
  if (!match?.[1]) {
    throw new Error(
      `TRANSCRIBE_S3_URI must name the s3://bucket/prefix Amazon Transcribe reads audio from and writes transcripts to, got "${uri}"`,
    );
  }
  return { bucket: match[1], prefix: (match[2] ?? "").replace(/\/+$/, "") };
}

/** A job name Transcribe accepts, unique per call. */
export function jobName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "");
  return `multimodal-${stamp}-${randomUUID().slice(0, 8)}`;
}

/** A transcription job that did not finish within its timeout. */
export class TranscriptionTimeoutError extends Error {
  constructor(
    readonly job: string,
    readonly timeoutMs: number,
  ) {
    super(`Amazon Transcribe job ${job} did not finish within ${timeoutMs} ms`);
    this.name = "TranscriptionTimeoutError";
  }
}

// Never trust the wire: validate before reading.
const jobSchema = z.object({
  TranscriptionJob: z.object({
    TranscriptionJobStatus: z.string().optional(),
    LanguageCode: z.string().optional(),
    FailureReason: z.string().optional(),
  }),
});

const transcriptSchema = z.object({
  results: z.object({
    transcripts: z.array(z.object({ transcript: z.string() })),
    items: z.array(z.object({ end_time: z.string().optional() })).optional(),
  }),
});

/** The end of the last timed item in a transcript, in seconds. */
function endOfSpeech(items: { end_time?: string }[] | undefined): number | undefined {
  const ends = (items ?? []).map((item) => Number(item.end_time)).filter(Number.isFinite);
  return ends.length > 0 ? Math.max(...ends) : undefined;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** An Amazon Transcribe provider with its own circuit breaker. Its clients are built at the first call. */
export function createTranscribeProvider(
  options: TranscribeProviderOptions = {},
): TranscriptionProvider {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const cb = createCircuitBreaker();
  let transcribeClient = options.transcribe;
  let s3Client = options.s3;

  function clients(): { transcribe: CommandClient; s3: CommandClient } {
    const region = process.env.AWS_REGION || DEFAULT_AWS_REGION;
    transcribeClient ??= new TranscribeClient({ region });
    s3Client ??= new S3Client({ region });
    return { transcribe: transcribeClient, s3: s3Client };
  }

  async function run(
    filePath: string,
    format: MediaFormat,
    { bucket, prefix }: { bucket: string; prefix: string },
    settings: TranscriptionSettings,
  ): Promise<TranscriptionResult> {
    const { transcribe, s3 } = clients();
    const timeoutMs = settings.timeoutMs ?? DEFAULT_TRANSCRIPTION_TIMEOUT_MS;
    const job = jobName();
    const root = prefix ? `${prefix}/${job}` : job;
    const mediaKey = `${root}/media/${basename(filePath)}`;
    const transcriptKey = `${root}/transcript.json`;

    try {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: mediaKey, Body: await readFile(filePath) }),
      );
      await transcribe.send(
        new StartTranscriptionJobCommand({
          TranscriptionJobName: job,
          Media: { MediaFileUri: `s3://${bucket}/${mediaKey}` },
          MediaFormat: format,
          OutputBucketName: bucket,
          OutputKey: transcriptKey,
          ...(settings.languageCode
            ? { LanguageCode: settings.languageCode as LanguageCode }
            : { IdentifyLanguage: true }),
        }),
      );

      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { TranscriptionJob: status } = jobSchema.parse(
          await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: job })),
        );
        if (status.TranscriptionJobStatus === "FAILED") {
          throw new Error(
            `Amazon Transcribe job ${job} failed: ${status.FailureReason ?? "no reason given"}`,
          );
        }
        if (status.TranscriptionJobStatus === "COMPLETED") {
          const object = (await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: transcriptKey }),
          )) as { Body?: { transformToString(): Promise<string> } };
          if (!object.Body) throw new Error(`Amazon Transcribe job ${job} wrote no transcript`);
          const { results } = transcriptSchema.parse(
            JSON.parse(await object.Body.transformToString()),
          );
          return {
            text: results.transcripts.map((t) => t.transcript).join(" "),
            duration: endOfSpeech(results.items),
            language: status.LanguageCode,
          };
        }
        if (Date.now() + pollIntervalMs > deadline)
          throw new TranscriptionTimeoutError(job, timeoutMs);
        await pause(pollIntervalMs);
      }
    } finally {
      for (const key of [mediaKey, transcriptKey]) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch((error) => {
          logger.warn("Could not delete a staged transcription object", {
            bucket,
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
  }

  return {
    async transcribe(filePath, mimeType, settings) {
      const format = MEDIA_FORMATS[mimeType];
      if (!format) throw new Error(`Amazon Transcribe takes no ${mimeType} audio`);
      // Settings are checked before the breaker, so a misconfiguration fails
      // the call without counting against Transcribe's health.
      const target = parseS3Uri(settings.s3Uri);
      return cb.execute(() => run(filePath, format, target, settings));
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its clients and circuit breaker hold across files.
const transcribeProvider = createTranscribeProvider();
registerTranscriptionProvider("transcribe", () => transcribeProvider);
