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
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  type LanguageCode,
  type MediaFormat,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from "@aws-sdk/client-transcribe";
import { z } from "zod";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { DEFAULT_TRANSCRIPTION_TIMEOUT_MS, MAX_TIMEOUT_MS } from "../resilience/request-timeout.js";

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
// fails, and reads the transcript back. Once the job settles, the call
// deletes both objects and the job. The role needs s3:PutObject,
// s3:GetObject and s3:DeleteObject under the prefix, and
// transcribe:StartTranscriptionJob, transcribe:GetTranscriptionJob and
// transcribe:DeleteTranscriptionJob.
//
// AUDIO_LANGUAGE_CODE fixes the language (`en-US`); unset, Transcribe
// identifies it and the result reports the one it found. Every request to
// AWS carries an abort signal and fails at its own timeout: the media upload
// at `uploadTimeoutMs`, every other request at `requestTimeoutMs`. A call
// fails with TranscriptionTimeoutError once it has run for
// AUDIO_TRANSCRIPTION_TIMEOUT_MS without its job finishing, which aborts a
// request still in flight then. Each call runs through the provider's
// circuit breaker.
//
// Transcribe has no call that stops a running job, and refuses to delete one
// that has not settled, so a job still running when its call fails goes on
// to write its transcript. The call deletes the media at once, and the
// provider follows the job for one more AUDIO_TRANSCRIPTION_TIMEOUT_MS,
// deleting the transcript and the job once it settles; `idle()` resolves
// when no job is being followed. A process that exits before then leaves the
// transcript to the S3 lifecycle rule that expires the staging prefix.
//

/** How long a call waits between reads of its job's status, in milliseconds. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** How long a request to Transcribe or S3 waits on its answer, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** How long the media upload waits on its answer, in milliseconds. */
export const DEFAULT_UPLOAD_TIMEOUT_MS = 300_000;

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
  /**
   * How long a call waits on its job, in milliseconds: a whole number from 1
   * to 2147483647. DEFAULT_TRANSCRIPTION_TIMEOUT_MS when unset.
   */
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

/** The Amazon Transcribe provider, which also says when it has stopped following timed-out jobs. */
export interface TranscribeProvider extends TranscriptionProvider {
  /** Resolves once the provider follows no job its call gave up on. */
  idle(): Promise<void>;
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
  send(command: object, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
}

export interface TranscribeProviderOptions {
  /** The Transcribe client. A TranscribeClient on the default credential chain when unset. */
  transcribe?: CommandClient;
  /** The S3 client. An S3Client on the default credential chain when unset. */
  s3?: CommandClient;
  /** How long a call waits between reads of its job's status, in milliseconds. */
  pollIntervalMs?: number;
  /** How long a request waits on its answer, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
  /** How long the media upload waits on its answer, in milliseconds. DEFAULT_UPLOAD_TIMEOUT_MS when unset. */
  uploadTimeoutMs?: number;
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

/** A request to Transcribe or S3 that got no answer within its timeout. */
export class AwsRequestTimeoutError extends Error {
  constructor(
    readonly command: string,
    readonly timeoutMs: number,
  ) {
    super(`${command} got no answer from AWS within ${timeoutMs} ms`);
    this.name = "AwsRequestTimeoutError";
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs `work` with an abort signal that fires after `timeoutMs`, or when
 * `deadline` fires if that is sooner, and rejects as soon as it fires
 * whether or not `work` honours it: with AwsRequestTimeoutError naming
 * `command` for the request's own timeout, and with the deadline's reason
 * for the deadline.
 */
async function bounded<T>(
  command: string,
  timeoutMs: number,
  deadline: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const own = AbortSignal.timeout(timeoutMs);
  const signal = deadline ? AbortSignal.any([own, deadline]) : own;
  const reason = () =>
    deadline?.aborted ? deadline.reason : new AwsRequestTimeoutError(command, timeoutMs);
  if (signal.aborted) throw reason();
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(reason());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work(signal), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Where a call stages its files, and the job that reads them. */
interface Staging {
  bucket: string;
  job: string;
  mediaKey: string;
  transcriptKey: string;
}

/** An Amazon Transcribe provider with its own circuit breaker. Its clients are built at the first call. */
export function createTranscribeProvider(
  options: TranscribeProviderOptions = {},
): TranscribeProvider {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const uploadTimeoutMs = options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  const cb = createCircuitBreaker();
  const following = new Set<Promise<void>>();
  let transcribeClient = options.transcribe;
  let s3Client = options.s3;

  function clients(): { transcribe: CommandClient; s3: CommandClient } {
    const region = process.env.AWS_REGION || DEFAULT_AWS_REGION;
    transcribeClient ??= new TranscribeClient({ region });
    s3Client ??= new S3Client({ region });
    return { transcribe: transcribeClient, s3: s3Client };
  }

  /** Sends `command` through `client` within `timeoutMs`, and within `deadline` when one is given. */
  function send(
    client: CommandClient,
    command: object,
    timeoutMs = requestTimeoutMs,
    deadline?: AbortSignal,
  ): Promise<unknown> {
    return bounded(command.constructor.name, timeoutMs, deadline, (abortSignal) =>
      client.send(command, { abortSignal }),
    );
  }

  async function removeObject(bucket: string, key: string): Promise<void> {
    await send(clients().s3, new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(
      (error: unknown) => {
        logger.warn("Could not delete a staged transcription object", {
          bucket,
          key,
          error: messageOf(error),
        });
      },
    );
  }

  /** Deletes a settled job's transcript and the job. */
  async function clearSettled({ bucket, job, transcriptKey }: Staging): Promise<void> {
    await removeObject(bucket, transcriptKey);
    await send(
      clients().transcribe,
      new DeleteTranscriptionJobCommand({ TranscriptionJobName: job }),
    ).catch((error: unknown) => {
      logger.warn("Could not delete an Amazon Transcribe job", { job, error: messageOf(error) });
    });
  }

  /**
   * Follows a job its call gave up on for `windowMs`, and clears it once it
   * settles. Transcribe answers BadRequestException for a job it does not
   * hold, which is a job whose start failed, so following ends there.
   */
  function follow(staging: Staging, windowMs: number): void {
    const { bucket, job, transcriptKey } = staging;
    logger.warn(
      "Following an Amazon Transcribe job its call gave up on, to delete its transcript",
      {
        job,
        transcript: `s3://${bucket}/${transcriptKey}`,
      },
    );
    const watch = (async () => {
      const until = Date.now() + windowMs;
      for (;;) {
        try {
          const { TranscriptionJob: status } = jobSchema.parse(
            await send(
              clients().transcribe,
              new GetTranscriptionJobCommand({ TranscriptionJobName: job }),
            ),
          );
          if (
            status.TranscriptionJobStatus === "COMPLETED" ||
            status.TranscriptionJobStatus === "FAILED"
          ) {
            await clearSettled(staging);
            return;
          }
        } catch (error) {
          if (error instanceof Error && error.name === "BadRequestException") return;
        }
        if (Date.now() + pollIntervalMs > until) {
          logger.error(
            "An Amazon Transcribe job did not settle while followed; the staging prefix's lifecycle rule expires its transcript",
            { job, transcript: `s3://${bucket}/${transcriptKey}` },
          );
          return;
        }
        await pause(pollIntervalMs);
      }
    })();
    following.add(watch);
    void watch.finally(() => following.delete(watch));
  }

  async function run(
    filePath: string,
    format: MediaFormat,
    { bucket, prefix }: { bucket: string; prefix: string },
    settings: TranscriptionSettings,
    timeoutMs: number,
  ): Promise<TranscriptionResult> {
    const { transcribe, s3 } = clients();
    const job = jobName();
    const root = prefix ? `${prefix}/${job}` : job;
    const staging: Staging = {
      bucket,
      job,
      mediaKey: `${root}/media/${basename(filePath)}`,
      transcriptKey: `${root}/transcript.json`,
    };
    const deadline = AbortSignal.timeout(timeoutMs);
    const deadlineAt = Date.now() + timeoutMs;
    // A start whose answer is lost may still have created the job, so the job
    // counts as started once the request is sent.
    let started = false;
    let settled = false;

    try {
      await send(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: staging.mediaKey,
          Body: await readFile(filePath),
        }),
        uploadTimeoutMs,
        deadline,
      );
      started = true;
      await send(
        transcribe,
        new StartTranscriptionJobCommand({
          TranscriptionJobName: job,
          Media: { MediaFileUri: `s3://${bucket}/${staging.mediaKey}` },
          MediaFormat: format,
          OutputBucketName: bucket,
          OutputKey: staging.transcriptKey,
          ...(settings.languageCode
            ? { LanguageCode: settings.languageCode as LanguageCode }
            : { IdentifyLanguage: true }),
        }),
        requestTimeoutMs,
        deadline,
      );

      for (;;) {
        const { TranscriptionJob: status } = jobSchema.parse(
          await send(
            transcribe,
            new GetTranscriptionJobCommand({ TranscriptionJobName: job }),
            requestTimeoutMs,
            deadline,
          ),
        );
        if (status.TranscriptionJobStatus === "FAILED") {
          settled = true;
          throw new Error(
            `Amazon Transcribe job ${job} failed: ${status.FailureReason ?? "no reason given"}`,
          );
        }
        if (status.TranscriptionJobStatus === "COMPLETED") {
          settled = true;
          const text = await bounded(
            "GetObjectCommand",
            requestTimeoutMs,
            deadline,
            async (abortSignal) => {
              const object = (await s3.send(
                new GetObjectCommand({ Bucket: bucket, Key: staging.transcriptKey }),
                { abortSignal },
              )) as { Body?: { transformToString(): Promise<string> } };
              if (!object.Body) throw new Error(`Amazon Transcribe job ${job} wrote no transcript`);
              return object.Body.transformToString();
            },
          );
          const { results } = transcriptSchema.parse(JSON.parse(text));
          return {
            text: results.transcripts.map((t) => t.transcript).join(" "),
            duration: endOfSpeech(results.items),
            language: status.LanguageCode,
          };
        }
        if (Date.now() + pollIntervalMs > deadlineAt) {
          throw new TranscriptionTimeoutError(job, timeoutMs);
        }
        await pause(pollIntervalMs);
      }
    } catch (error) {
      throw error === deadline.reason ? new TranscriptionTimeoutError(job, timeoutMs) : error;
    } finally {
      await removeObject(bucket, staging.mediaKey);
      if (settled) await clearSettled(staging);
      else if (started) follow(staging, timeoutMs);
    }
  }

  return {
    async transcribe(filePath, mimeType, settings) {
      const format = MEDIA_FORMATS[mimeType];
      if (!format) throw new Error(`Amazon Transcribe takes no ${mimeType} audio`);
      // Settings are checked before the breaker, so a misconfiguration fails
      // the call without counting against Transcribe's health.
      const target = parseS3Uri(settings.s3Uri);
      const timeoutMs = settings.timeoutMs ?? DEFAULT_TRANSCRIPTION_TIMEOUT_MS;
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
        throw new Error(
          `AUDIO_TRANSCRIPTION_TIMEOUT_MS must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}, got ${timeoutMs}`,
        );
      }
      return cb.execute(() => run(filePath, format, target, settings, timeoutMs));
    },

    async idle() {
      while (following.size > 0) await Promise.all(following);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its clients and circuit breaker hold across files.
const transcribeProvider = createTranscribeProvider();
registerTranscriptionProvider("transcribe", () => transcribeProvider);
