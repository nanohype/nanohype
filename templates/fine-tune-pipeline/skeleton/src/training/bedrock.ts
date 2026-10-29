import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  BedrockClient,
  CreateModelCustomizationJobCommand,
  GetModelCustomizationJobCommand,
  type GetModelCustomizationJobCommandOutput,
  ListModelCustomizationJobsCommand,
  StopModelCustomizationJobCommand,
} from "@aws-sdk/client-bedrock";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { TrainingJobConfig, TrainingJobStatus, TrainingProvider } from "./types.js";

// ── Bedrock Training Provider ───────────────────────────────────────
//
// Fine-tunes a Bedrock base model with a model customization job, under the
// IAM role the AWS SDK's default credential chain resolves: on a CI runner
// the role the job federates its OIDC token into, on a workstation the AWS
// profile the environment selects. Nothing here holds a provider key.
//
// Two roles take part. The caller's role uploads the prepared splits to S3
// and submits the job; it needs s3:PutObject under TRAINING_S3_URI,
// bedrock:CreateModelCustomizationJob and the other job actions, and
// iam:PassRole on TRAINING_ROLE_ARN, and for `complete` bedrock:InvokeModel
// on the models it names (below). TRAINING_ROLE_ARN is the service role
// Bedrock assumes while the job runs, to read the splits and write its
// output under TRAINING_S3_URI.
//
// A job's splits land under <TRAINING_S3_URI>/<job name>/data/ and its
// output under <TRAINING_S3_URI>/<job name>/output/. The prepared splits
// are chat-format JSONL; Bedrock reads the
// bedrock-conversation-2024 schema the Amazon Nova base models train on, so
// an upload converts each record: a system message becomes the `system`
// block, and every other turn keeps its role with its text as a content
// block. A record whose turns do not run from a user turn to an assistant
// turn fails the upload with its line number, before any job is submitted.
//
// Hyperparameters go to Bedrock under the base model's API names, and only
// the ones that are set: epochs as epochCount, batchSize, and learningRate.
// Which of those a base model accepts, and over what range, is the base
// model's own; Bedrock refuses a job that names one it does not.
//
// `complete` calls Converse for the eval. The base model is invoked through
// an inference profile (EVAL_BASE_MODEL), which needs bedrock:InvokeModel on
// the profile and on the foundation model it routes to in every one of the
// profile's destination regions, and a fine-tuned model through the custom
// model deployment or Provisioned Throughput serving it: a custom model's
// ARN alone serves no traffic.
//
// Every request to AWS carries an abort signal and fails with
// AwsRequestTimeoutError at its timeout, whether or not the client honours
// the signal: a split upload at `uploadTimeoutMs`, a job call at
// `controlTimeoutMs`, and an eval completion at `requestTimeoutMs`. The
// SDK's retries run inside that timeout.
//

/** The region Bedrock and S3 are called in when AWS_REGION is unset or empty. */
export const DEFAULT_AWS_REGION = "us-east-1";

/** How long an eval completion waits on its reply, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** How long a Bedrock job call (create, get, stop, list) waits on its answer, in milliseconds. */
export const DEFAULT_CONTROL_TIMEOUT_MS = 30_000;

/** How long a split upload to S3 waits on its answer, in milliseconds. */
export const DEFAULT_UPLOAD_TIMEOUT_MS = 300_000;

/** The schema version every converted record declares. */
export const CONVERSATION_SCHEMA = "bedrock-conversation-2024";

/** The reply length an eval completion asks for. */
const MAX_TOKENS = 4096;

/** The part of an AWS SDK client the provider calls: `send`. */
export interface CommandClient {
  send(command: object, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
}

export interface BedrockTrainingOptions {
  /** The service role Bedrock assumes to run the job. TRAINING_ROLE_ARN when unset. */
  roleArn?: string;
  /** The S3 prefix uploads and job output go under, as s3://bucket/prefix. TRAINING_S3_URI when unset. */
  s3Uri?: string;
  /** The Bedrock control-plane client. A BedrockClient on the default credential chain when unset. */
  bedrock?: CommandClient;
  /** The Bedrock runtime client eval completions go through. A BedrockRuntimeClient when unset. */
  runtime?: CommandClient;
  /** The S3 client uploads go through. An S3Client when unset. */
  s3?: CommandClient;
  /** How long an eval completion waits on its reply, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
  /** How long a Bedrock job call waits on its answer, in milliseconds. DEFAULT_CONTROL_TIMEOUT_MS when unset. */
  controlTimeoutMs?: number;
  /** How long a split upload waits on its answer, in milliseconds. DEFAULT_UPLOAD_TIMEOUT_MS when unset. */
  uploadTimeoutMs?: number;
  /** The clock job names and upload keys are stamped from. */
  now?: () => Date;
}

/** A request to Bedrock or S3 that got no answer within its timeout. */
export class AwsRequestTimeoutError extends Error {
  constructor(
    readonly command: string,
    readonly timeoutMs: number,
  ) {
    super(`${command} got no answer from AWS within ${timeoutMs} ms`);
    this.name = "AwsRequestTimeoutError";
  }
}

/**
 * Sends `command` through `client` with an abort signal that fires after
 * `timeoutMs`, and rejects with AwsRequestTimeoutError as soon as it fires,
 * whether or not the client honours it.
 */
export async function sendWithin(
  client: CommandClient,
  command: object,
  timeoutMs: number,
): Promise<unknown> {
  const signal = AbortSignal.timeout(timeoutMs);
  const name = command.constructor.name;
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new AwsRequestTimeoutError(name, timeoutMs));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([client.send(command, { abortSignal: signal }), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** An S3 location, split into its bucket and key prefix (without a trailing slash). */
export function parseS3Uri(uri: string): { bucket: string; prefix: string } {
  const match = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/.exec(uri.trim());
  if (!match?.[1]) {
    throw new Error(`TRAINING_S3_URI must be an S3 URI such as s3://bucket/prefix, got "${uri}"`);
  }
  return { bucket: match[1], prefix: (match[2] ?? "").replace(/\/+$/, "") };
}

interface ChatRecord {
  messages: { role: string; content: string }[];
}

/**
 * One chat-format JSONL record as a bedrock-conversation-2024 record.
 * Throws when its turns do not run from a user turn to an assistant turn.
 */
export function toConversationRecord(record: ChatRecord, line: number): Record<string, unknown> {
  const system = record.messages.filter((m) => m.role === "system");
  const turns = record.messages.filter((m) => m.role !== "system");
  if (turns[0]?.role !== "user" || turns.at(-1)?.role !== "assistant") {
    throw new Error(
      `Line ${line}: a training record's turns must start with a user turn and end with an ` +
        "assistant turn",
    );
  }
  return {
    schemaVersion: CONVERSATION_SCHEMA,
    ...(system.length > 0 ? { system: system.map((m) => ({ text: m.content })) } : {}),
    messages: turns.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
  };
}

/** A chat-format JSONL file as bedrock-conversation-2024 JSONL, and how many records it holds. */
export function toConversationJsonl(text: string): { body: string; records: number } {
  const lines = text.split("\n");
  const out: string[] = [];
  lines.forEach((raw, index) => {
    if (raw.trim() === "") return;
    out.push(JSON.stringify(toConversationRecord(JSON.parse(raw) as ChatRecord, index + 1)));
  });
  return { body: out.length > 0 ? `${out.join("\n")}\n` : "", records: out.length };
}

/** A UTC timestamp, digits only, that sorts in submission order. */
function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d+Z$/, "")
    .replace(/\D/g, "");
}

/** `value` as a job or model name: letters, digits and single hyphens, at most 63 characters. */
export function jobName(suffix: string | undefined, date: Date): string {
  const base = (suffix ?? "fine-tune")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63 - 15);
  return `${base || "fine-tune"}-${stamp(date)}`;
}

/** Bedrock's job status as the pipeline's. */
export function normalizeStatus(status: string | undefined): TrainingJobStatus["status"] {
  switch (status) {
    case "InProgress":
    case "Stopping":
      return "running";
    case "Completed":
      return "succeeded";
    case "Failed":
      return "failed";
    case "Stopped":
      return "cancelled";
    default:
      return "pending";
  }
}

function iso(date: Date | undefined): string | undefined {
  return date ? new Date(date).toISOString() : undefined;
}

/** A GetModelCustomizationJob reply as the pipeline's job status. */
export function toJobStatus(job: GetModelCustomizationJobCommandOutput): TrainingJobStatus {
  const metrics: Record<string, number> = {};
  if (job.trainingMetrics?.trainingLoss !== undefined) {
    metrics.training_loss = job.trainingMetrics.trainingLoss;
  }
  const validationLoss = job.validationMetrics?.[0]?.validationLoss;
  if (validationLoss !== undefined) metrics.validation_loss = validationLoss;
  return {
    id: job.jobArn ?? "",
    status: normalizeStatus(job.status),
    baseModel: job.baseModelArn ?? "",
    fineTunedModel: job.outputModelArn ?? undefined,
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
    error: job.failureMessage ?? undefined,
    createdAt: iso(job.creationTime) ?? "",
    finishedAt: iso(job.endTime),
  };
}

/** A Bedrock training provider. Its clients are built at their first call. */
export function createBedrockTrainingProvider(
  options: BedrockTrainingOptions = {},
): TrainingProvider {
  const region = () => process.env.AWS_REGION || DEFAULT_AWS_REGION;
  const now = options.now ?? (() => new Date());
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controlTimeoutMs = options.controlTimeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS;
  const uploadTimeoutMs = options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  const cb = createCircuitBreaker();
  let bedrock = options.bedrock;
  let runtime = options.runtime;
  let s3 = options.s3;

  function required(value: string | undefined, name: string): string {
    if (!value) throw new Error(`${name} must be set to submit a fine-tuning job on Bedrock`);
    return value;
  }

  const roleArn = () =>
    required(options.roleArn ?? process.env.TRAINING_ROLE_ARN, "TRAINING_ROLE_ARN");
  const location = () =>
    parseS3Uri(required(options.s3Uri ?? process.env.TRAINING_S3_URI, "TRAINING_S3_URI"));

  /** Sends a job call to the Bedrock control plane, through the breaker and within its timeout. */
  function control(command: object): Promise<unknown> {
    bedrock ??= new BedrockClient({ region: region() });
    const client = bedrock;
    return cb.execute(() => sendWithin(client, command, controlTimeoutMs));
  }

  /**
   * Uploads a split, converted, under `folder` beneath TRAINING_S3_URI, and
   * returns its S3 URI, or undefined when it holds no record.
   */
  async function upload(filePath: string, folder: string): Promise<string | undefined> {
    const { bucket, prefix } = location();
    const { body, records } = toConversationJsonl(await readFile(filePath, "utf-8"));
    if (records === 0) return undefined;
    const key = [prefix, folder, basename(filePath)].filter(Boolean).join("/");
    s3 ??= new S3Client({ region: region() });
    const client = s3;
    await cb.execute(() =>
      sendWithin(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "application/jsonl",
        }),
        uploadTimeoutMs,
      ),
    );
    return `s3://${bucket}/${key}`;
  }

  async function getJobStatus(jobId: string): Promise<TrainingJobStatus> {
    const job = (await control(
      new GetModelCustomizationJobCommand({ jobIdentifier: jobId }),
    )) as GetModelCustomizationJobCommandOutput;
    return toJobStatus(job);
  }

  return {
    async uploadFile(filePath: string): Promise<string> {
      const uri = await upload(filePath, `uploads/${stamp(now())}`);
      if (!uri) throw new Error(`${filePath} holds no training record`);
      return uri;
    },

    async createJob(config: TrainingJobConfig): Promise<TrainingJobStatus> {
      const role = roleArn();
      const { bucket, prefix } = location();
      const created = now();
      const name = jobName(config.suffix, created);
      const trainingUri = await upload(config.trainingFile, `${name}/data`);
      if (!trainingUri) throw new Error(`${config.trainingFile} holds no training record`);
      const validationUri = config.validationFile
        ? await upload(config.validationFile, `${name}/data`)
        : undefined;

      const hyperParameters: Record<string, string> = {};
      if (config.epochs !== undefined) hyperParameters.epochCount = String(config.epochs);
      if (config.batchSize !== undefined) hyperParameters.batchSize = String(config.batchSize);
      if (config.learningRate !== undefined) {
        hyperParameters.learningRate = String(config.learningRate);
      }

      const output = [prefix, name, "output"].filter(Boolean).join("/");
      const { jobArn } = (await control(
        new CreateModelCustomizationJobCommand({
          jobName: name,
          customModelName: name,
          customizationType: "FINE_TUNING",
          roleArn: role,
          baseModelIdentifier: config.baseModel,
          trainingDataConfig: { s3Uri: trainingUri },
          ...(validationUri
            ? { validationDataConfig: { validators: [{ s3Uri: validationUri }] } }
            : {}),
          outputDataConfig: { s3Uri: `s3://${bucket}/${output}/` },
          ...(Object.keys(hyperParameters).length > 0 ? { hyperParameters } : {}),
        }),
      )) as { jobArn?: string };
      if (!jobArn) throw new Error("Bedrock accepted the fine-tuning job but returned no job ARN");

      return {
        id: jobArn,
        status: "pending",
        baseModel: config.baseModel,
        createdAt: created.toISOString(),
      };
    },

    getJobStatus,

    async cancelJob(jobId: string): Promise<TrainingJobStatus> {
      await control(new StopModelCustomizationJobCommand({ jobIdentifier: jobId }));
      return getJobStatus(jobId);
    },

    async listJobs(limit = 10): Promise<TrainingJobStatus[]> {
      const { modelCustomizationJobSummaries = [] } = (await control(
        new ListModelCustomizationJobsCommand({
          maxResults: limit,
          sortBy: "CreationTime",
          sortOrder: "Descending",
        }),
      )) as {
        modelCustomizationJobSummaries?: {
          jobArn?: string;
          status?: string;
          baseModelArn?: string;
          customModelArn?: string;
          creationTime?: Date;
          endTime?: Date;
        }[];
      };
      return modelCustomizationJobSummaries.slice(0, limit).map((job) => ({
        id: job.jobArn ?? "",
        status: normalizeStatus(job.status),
        baseModel: job.baseModelArn ?? "",
        fineTunedModel: job.customModelArn ?? undefined,
        createdAt: iso(job.creationTime) ?? "",
        finishedAt: iso(job.endTime),
      }));
    },

    async complete(model: string, prompt: string): Promise<string> {
      runtime ??= new BedrockRuntimeClient({ region: region() });
      const client = runtime;
      const reply = (await cb.execute(() =>
        sendWithin(
          client,
          new ConverseCommand({
            modelId: model,
            messages: [{ role: "user", content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens: MAX_TOKENS },
          }),
          requestTimeoutMs,
        ),
      )) as { output?: { message?: { content?: { text?: string }[] } } };
      return (reply.output?.message?.content ?? []).map((block) => block.text ?? "").join("");
    },
  };
}

registerProvider("bedrock", () => createBedrockTrainingProvider());
