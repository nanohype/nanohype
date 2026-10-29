/**
 * Tests for the bedrock training provider.
 *
 * The provider talks to three AWS clients: S3 for the splits, the Bedrock
 * control plane for the job, and the Bedrock runtime for eval completions.
 * Most cases hand it fake clients that record each command they are sent,
 * so an assertion reads exactly what would go to AWS. One case runs the
 * real S3 and Bedrock clients against an HTTP server listening in-process
 * on the loopback interface, with static test credentials in the
 * environment, so the request paths, bodies and signatures are the SDK's
 * own and no request leaves the machine.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BedrockClient } from "@aws-sdk/client-bedrock";
import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONVERSATION_SCHEMA,
  type CommandClient,
  createBedrockTrainingProvider,
  jobName,
  normalizeStatus,
  parseS3Uri,
  toConversationJsonl,
} from "../training/bedrock.js";

const ROLE = "arn:aws:iam::123456789012:role/bedrock-customization";
const NOW = new Date("2026-10-29T01:02:03.456Z");
const JOB_ARN =
  "arn:aws:bedrock:us-east-1:123456789012:model-customization-job/amazon.nova-micro-v1:0:128k/abcdef123456";

/** A fake AWS client that records the commands it is sent and answers each with `answer`. */
function fakeClient(
  answer: (name: string, input: Record<string, unknown>) => unknown = () => ({}),
) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const client: CommandClient = {
    async send(command: object) {
      const name = command.constructor.name;
      const input = (command as { input: Record<string, unknown> }).input;
      sent.push({ name, input });
      return answer(name, input);
    },
  };
  return { client, sent };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "bedrock-training-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

/** Writes chat-format JSONL records to `name` in the test directory and returns its path. */
async function split(name: string, records: unknown[]): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
  return path;
}

const EXAMPLE = {
  messages: [
    { role: "system", content: "Answer in the triage form." },
    { role: "user", content: "The deploy is stuck." },
    { role: "assistant", content: "SEVERITY: high" },
  ],
};

describe("toConversationJsonl", () => {
  it("converts chat records to bedrock-conversation-2024, the system message as the system block", () => {
    const { body, records } = toConversationJsonl(
      `${JSON.stringify(EXAMPLE)}\n\n${JSON.stringify({ messages: EXAMPLE.messages.slice(1) })}\n`,
    );

    expect(records).toBe(2);
    const [first, second] = body
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(first).toEqual({
      schemaVersion: CONVERSATION_SCHEMA,
      system: [{ text: "Answer in the triage form." }],
      messages: [
        { role: "user", content: [{ text: "The deploy is stuck." }] },
        { role: "assistant", content: [{ text: "SEVERITY: high" }] },
      ],
    });
    expect(second).not.toHaveProperty("system");
  });

  it("fails a record whose turns do not run from user to assistant, naming its line", () => {
    const backwards = {
      messages: [
        { role: "assistant", content: "a" },
        { role: "user", content: "b" },
      ],
    };

    expect(() =>
      toConversationJsonl(`${JSON.stringify(EXAMPLE)}\n${JSON.stringify(backwards)}`),
    ).toThrow(/^Line 2: /);
  });

  it("holds no record for an empty split", () => {
    expect(toConversationJsonl("\n")).toEqual({ body: "", records: 0 });
  });
});

describe("parseS3Uri and jobName", () => {
  it("splits an S3 URI into its bucket and a prefix without a trailing slash", () => {
    expect(parseS3Uri("s3://training-bucket/team/project/")).toEqual({
      bucket: "training-bucket",
      prefix: "team/project",
    });
    expect(parseS3Uri("s3://training-bucket")).toEqual({ bucket: "training-bucket", prefix: "" });
    expect(() => parseS3Uri("https://training-bucket.s3.amazonaws.com/x")).toThrow(
      /TRAINING_S3_URI/,
    );
  });

  it("names a job from the suffix and a timestamp, in Bedrock's name alphabet, within 63 characters", () => {
    expect(jobName("my_project", NOW)).toBe("my-project-20261029010203");
    expect(jobName("--", NOW)).toBe("fine-tune-20261029010203");
    const long = jobName("x".repeat(100), NOW);
    expect(long).toHaveLength(63);
    expect(long).toMatch(/^([0-9a-zA-Z][_-]?){1,63}$/);
  });
});

describe("createJob", () => {
  it("uploads the converted splits under the job's name and submits a fine-tuning job", async () => {
    const s3 = fakeClient();
    const bedrock = fakeClient(() => ({ jobArn: JOB_ARN }));
    const provider = createBedrockTrainingProvider({
      roleArn: ROLE,
      s3Uri: "s3://training-bucket/team",
      s3: s3.client,
      bedrock: bedrock.client,
      now: () => NOW,
    });

    const status = await provider.createJob({
      trainingFile: await split("train.jsonl", [EXAMPLE]),
      validationFile: await split("validation.jsonl", [EXAMPLE]),
      baseModel: "amazon.nova-micro-v1:0:128k",
      epochs: 2,
      learningRate: 0.00001,
      suffix: "triage",
    });

    expect(status).toEqual({
      id: JOB_ARN,
      status: "pending",
      baseModel: "amazon.nova-micro-v1:0:128k",
      createdAt: NOW.toISOString(),
    });
    expect(s3.sent.map(({ name, input }) => [name, input.Bucket, input.Key])).toEqual([
      ["PutObjectCommand", "training-bucket", "team/triage-20261029010203/data/train.jsonl"],
      ["PutObjectCommand", "training-bucket", "team/triage-20261029010203/data/validation.jsonl"],
    ]);
    expect(JSON.parse(String(s3.sent[0]?.input.Body).trimEnd())).toMatchObject({
      schemaVersion: CONVERSATION_SCHEMA,
    });
    expect(bedrock.sent).toEqual([
      {
        name: "CreateModelCustomizationJobCommand",
        input: {
          jobName: "triage-20261029010203",
          customModelName: "triage-20261029010203",
          customizationType: "FINE_TUNING",
          roleArn: ROLE,
          baseModelIdentifier: "amazon.nova-micro-v1:0:128k",
          trainingDataConfig: {
            s3Uri: "s3://training-bucket/team/triage-20261029010203/data/train.jsonl",
          },
          validationDataConfig: {
            validators: [
              { s3Uri: "s3://training-bucket/team/triage-20261029010203/data/validation.jsonl" },
            ],
          },
          outputDataConfig: { s3Uri: "s3://training-bucket/team/triage-20261029010203/output/" },
          hyperParameters: { epochCount: "2", learningRate: "0.00001" },
        },
      },
    ]);
  });

  it("sends no hyperparameter that is unset, and no validation split that is empty", async () => {
    const s3 = fakeClient();
    const bedrock = fakeClient(() => ({ jobArn: JOB_ARN }));
    const provider = createBedrockTrainingProvider({
      roleArn: ROLE,
      s3Uri: "s3://training-bucket",
      s3: s3.client,
      bedrock: bedrock.client,
      now: () => NOW,
    });

    await provider.createJob({
      trainingFile: await split("train.jsonl", [EXAMPLE]),
      validationFile: await split("validation.jsonl", []),
      baseModel: "amazon.nova-micro-v1:0:128k",
    });

    expect(s3.sent).toHaveLength(1);
    const input = bedrock.sent[0]?.input ?? {};
    expect(input).not.toHaveProperty("hyperParameters");
    expect(input).not.toHaveProperty("validationDataConfig");
    expect(input.outputDataConfig).toEqual({
      s3Uri: "s3://training-bucket/fine-tune-20261029010203/output/",
    });
  });

  it("names the setting it needs before it uploads anything", async () => {
    vi.stubEnv("TRAINING_ROLE_ARN", "");
    vi.stubEnv("TRAINING_S3_URI", "s3://training-bucket");
    const s3 = fakeClient();
    const provider = createBedrockTrainingProvider({ s3: s3.client, bedrock: fakeClient().client });

    await expect(
      provider.createJob({ trainingFile: await split("train.jsonl", [EXAMPLE]), baseModel: "m" }),
    ).rejects.toThrow(/^TRAINING_ROLE_ARN must be set/);
    expect(s3.sent).toHaveLength(0);
  });

  it("reads the role and S3 location from the environment", async () => {
    vi.stubEnv("TRAINING_ROLE_ARN", ROLE);
    vi.stubEnv("TRAINING_S3_URI", "s3://env-bucket/prefix");
    const s3 = fakeClient();
    const bedrock = fakeClient(() => ({ jobArn: JOB_ARN }));
    const provider = createBedrockTrainingProvider({
      s3: s3.client,
      bedrock: bedrock.client,
      now: () => NOW,
    });

    await provider.createJob({
      trainingFile: await split("train.jsonl", [EXAMPLE]),
      baseModel: "m",
    });

    expect(s3.sent[0]?.input.Bucket).toBe("env-bucket");
    expect(bedrock.sent[0]?.input.roleArn).toBe(ROLE);
  });

  it("signs the upload and the job with the default chain's credentials, and sends no provider key", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDTRAININGTEST");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "training-test-secret");
    vi.stubEnv("AWS_SESSION_TOKEN", "training-test-session");
    vi.stubEnv("AWS_PROFILE", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");
    const received: {
      method?: string;
      url?: string;
      headers: IncomingHttpHeaders;
      body: string;
    }[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        received.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        if (req.url?.startsWith("/model-customization-jobs")) {
          res.writeHead(201, { "content-type": "application/json" });
          res.end(JSON.stringify({ jobArn: JOB_ARN }));
          return;
        }
        res.writeHead(200, { etag: '"etag"' });
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const provider = createBedrockTrainingProvider({
        roleArn: ROLE,
        s3Uri: "s3://training-bucket/team",
        s3: new S3Client({ region: "us-east-1", endpoint, forcePathStyle: true, maxAttempts: 1 }),
        bedrock: new BedrockClient({ region: "us-east-1", endpoint, maxAttempts: 1 }),
        now: () => NOW,
      });
      await provider.createJob({
        trainingFile: await split("train.jsonl", [EXAMPLE]),
        baseModel: "amazon.nova-micro-v1:0:128k",
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(received.map((r) => [r.method, r.url?.split("?")[0]])).toEqual([
      ["PUT", "/training-bucket/team/fine-tune-20261029010203/data/train.jsonl"],
      ["POST", "/model-customization-jobs"],
    ]);
    expect(received[0]?.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDTRAININGTEST\/\d{8}\/us-east-1\/s3\//,
    );
    expect(received[1]?.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDTRAININGTEST\/\d{8}\/us-east-1\/bedrock\//,
    );
    expect(JSON.parse(received[1]?.body ?? "{}")).toMatchObject({
      customizationType: "FINE_TUNING",
      roleArn: ROLE,
      baseModelIdentifier: "amazon.nova-micro-v1:0:128k",
    });
    expect(JSON.stringify(received)).not.toMatch(/must-not-leave/);
  });
});

describe("job status", () => {
  const job = {
    jobArn: JOB_ARN,
    status: "Completed",
    baseModelArn: "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0:128k",
    outputModelArn: "arn:aws:bedrock:us-east-1:123456789012:custom-model/abc",
    creationTime: new Date("2026-10-29T01:00:00Z"),
    endTime: new Date("2026-10-29T03:00:00Z"),
    trainingMetrics: { trainingLoss: 0.12 },
    validationMetrics: [{ validationLoss: 0.2 }],
  };

  it("maps Bedrock's job to the pipeline's status", async () => {
    const bedrock = fakeClient(() => job);
    const provider = createBedrockTrainingProvider({ bedrock: bedrock.client });

    expect(await provider.getJobStatus(JOB_ARN)).toEqual({
      id: JOB_ARN,
      status: "succeeded",
      baseModel: job.baseModelArn,
      fineTunedModel: job.outputModelArn,
      metrics: { training_loss: 0.12, validation_loss: 0.2 },
      error: undefined,
      createdAt: "2026-10-29T01:00:00.000Z",
      finishedAt: "2026-10-29T03:00:00.000Z",
    });
    expect(bedrock.sent).toEqual([
      { name: "GetModelCustomizationJobCommand", input: { jobIdentifier: JOB_ARN } },
    ]);
  });

  it("stops a job and reports where it got to", async () => {
    const bedrock = fakeClient((name) =>
      name === "StopModelCustomizationJobCommand" ? {} : { ...job, status: "Stopping" },
    );
    const provider = createBedrockTrainingProvider({ bedrock: bedrock.client });

    expect((await provider.cancelJob(JOB_ARN)).status).toBe("running");
    expect(bedrock.sent.map((s) => s.name)).toEqual([
      "StopModelCustomizationJobCommand",
      "GetModelCustomizationJobCommand",
    ]);
  });

  it("lists the most recent jobs first, up to the limit", async () => {
    const bedrock = fakeClient(() => ({
      modelCustomizationJobSummaries: [
        { jobArn: "a", status: "InProgress", baseModelArn: "m", creationTime: job.creationTime },
        { jobArn: "b", status: "Failed", baseModelArn: "m", creationTime: job.creationTime },
        { jobArn: "c", status: "Stopped", baseModelArn: "m", creationTime: job.creationTime },
      ],
    }));
    const provider = createBedrockTrainingProvider({ bedrock: bedrock.client });

    const jobs = await provider.listJobs(2);

    expect(jobs.map((j) => [j.id, j.status])).toEqual([
      ["a", "running"],
      ["b", "failed"],
    ]);
    expect(bedrock.sent[0]?.input).toEqual({
      maxResults: 2,
      sortBy: "CreationTime",
      sortOrder: "Descending",
    });
  });

  it("reads every Bedrock status, and an unknown one as pending", () => {
    expect(
      ["InProgress", "Stopping", "Completed", "Failed", "Stopped", undefined].map(normalizeStatus),
    ).toEqual(["running", "running", "succeeded", "failed", "cancelled", "pending"]);
  });
});

describe("complete", () => {
  it("sends the prompt to Converse for the model it names and returns the reply's text", async () => {
    const runtime = fakeClient(() => ({
      output: {
        message: { role: "assistant", content: [{ text: "SEVERITY: " }, { text: "low" }] },
      },
    }));
    const provider = createBedrockTrainingProvider({ runtime: runtime.client });

    expect(await provider.complete("us.amazon.nova-micro-v1:0", "The deploy is stuck.")).toBe(
      "SEVERITY: low",
    );
    expect(runtime.sent).toEqual([
      {
        name: "ConverseCommand",
        input: {
          modelId: "us.amazon.nova-micro-v1:0",
          messages: [{ role: "user", content: [{ text: "The deploy is stuck." }] }],
          inferenceConfig: { maxTokens: 4096 },
        },
      },
    ]);
  });
});

describe("registration", () => {
  it("registers bedrock and mock, and names what it holds for an unknown provider", async () => {
    const { getProvider, listProviders } = await import("../training/index.js");

    expect(listProviders()).toEqual(expect.arrayContaining(["bedrock", "mock"]));
    expect(() => getProvider("missing")).toThrow(/Registered: .*bedrock/);
  });
});
