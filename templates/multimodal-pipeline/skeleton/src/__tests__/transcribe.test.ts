import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CommandClient,
  createTranscribeProvider,
  DEFAULT_AWS_REGION,
  jobName,
  MEDIA_FORMATS,
  parseS3Uri,
  TranscriptionTimeoutError,
} from "../providers/transcribe.js";
import { CircuitBreakerOpenError } from "../resilience/circuit-breaker.js";

// ── Amazon Transcribe Tests ─────────────────────────────────────────
//
// The transcribe provider stages audio in S3, runs a Transcribe batch job
// over it, and reads the transcript back, under whatever credentials the
// AWS SDK's default chain resolves. Most of these drive it with recording
// fake clients, holding it to the commands it sends and their order, to
// the job's polling and timeout, to the result it reads from the
// transcript, and to deleting what it staged whether the job succeeds or
// fails. One runs the real Transcribe and S3 clients against an HTTP
// server listening in-process on the loopback interface, with static test
// credentials in the environment, so it reads the requests as AWS would
// receive them, signed by the chain and carrying no provider key, and no
// request leaves the machine.
//

const S3_URI = "s3://audio-bucket/staging/";

const TRANSCRIPT = {
  jobName: "job",
  results: {
    transcripts: [{ transcript: "Hello there." }, { transcript: "Goodbye." }],
    items: [
      { start_time: "0.1", end_time: "0.6", type: "pronunciation" },
      { type: "punctuation" },
      { start_time: "1.0", end_time: "2.25", type: "pronunciation" },
    ],
  },
  status: "COMPLETED",
};

interface Recorded {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Fake Transcribe and S3 clients that record each command they receive.
 * The job reports IN_PROGRESS for `pending` reads of its status, then
 * `final`, and the transcript object holds `transcript`, or has no body
 * when it is null.
 */
function fakeClients({
  pending = 0,
  final = { TranscriptionJobStatus: "COMPLETED", LanguageCode: "en-US" } as Record<string, unknown>,
  transcript = JSON.stringify(TRANSCRIPT) as string | null,
  failDelete = false,
} = {}) {
  const sent: Recorded[] = [];
  let reads = 0;
  const record = (command: object) => {
    const { input } = command as { input: Record<string, unknown> };
    sent.push({ name: command.constructor.name, input });
  };
  const transcribe: CommandClient = {
    async send(command) {
      record(command);
      if (command instanceof GetTranscriptionJobCommand) {
        reads++;
        return {
          TranscriptionJob:
            reads <= pending ? { TranscriptionJobStatus: "IN_PROGRESS" } : { ...final },
        };
      }
      return {};
    },
  };
  const s3: CommandClient = {
    async send(command) {
      record(command);
      if (command instanceof GetObjectCommand) {
        return transcript === null ? {} : { Body: { transformToString: async () => transcript } };
      }
      if (command instanceof DeleteObjectCommand && failDelete) throw new Error("AccessDenied");
      return {};
    },
  };
  return { transcribe, s3, sent };
}

let dir = "";
let audio = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "transcribe-test-"));
  audio = join(dir, "talk.mp3");
  await writeFile(audio, Buffer.from("ID3-fake-mp3"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("parseS3Uri", () => {
  it.each([
    ["s3://audio-bucket/staging/", { bucket: "audio-bucket", prefix: "staging" }],
    ["s3://audio-bucket/a/b", { bucket: "audio-bucket", prefix: "a/b" }],
    ["s3://audio-bucket", { bucket: "audio-bucket", prefix: "" }],
  ])("reads %s", (uri, expected) => {
    expect(parseS3Uri(uri)).toEqual(expected);
  });

  it.each(["", "audio-bucket/staging", "https://audio-bucket.s3.amazonaws.com/x", "s3://A/b"])(
    "refuses %o",
    (uri) => {
      expect(() => parseS3Uri(uri)).toThrow(
        /^TRANSCRIBE_S3_URI must name the s3:\/\/bucket\/prefix/,
      );
    },
  );
});

describe("jobName", () => {
  it("is a name Transcribe accepts, unique per call", () => {
    const now = new Date("2026-03-04T05:06:07.890Z");
    const a = jobName(now);
    expect(a).toMatch(/^multimodal-20260304050607890-[0-9a-f]{8}$/);
    expect(a).toMatch(/^[0-9a-zA-Z._-]{1,200}$/);
    expect(jobName(now)).not.toBe(a);
  });
});

describe("transcribe provider", () => {
  it("stages the audio, runs the job, reads the transcript and deletes what it staged", async () => {
    const { transcribe, s3, sent } = fakeClients();

    const result = await createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 }).transcribe(
      audio,
      "audio/mpeg",
      { s3Uri: S3_URI },
    );

    expect(result).toEqual({ text: "Hello there. Goodbye.", duration: 2.25, language: "en-US" });
    expect(sent.map((c) => c.name)).toEqual([
      "PutObjectCommand",
      "StartTranscriptionJobCommand",
      "GetTranscriptionJobCommand",
      "GetObjectCommand",
      "DeleteObjectCommand",
      "DeleteObjectCommand",
    ]);
    const job = sent[1]?.input.TranscriptionJobName as string;
    expect(sent[0]?.input).toMatchObject({
      Bucket: "audio-bucket",
      Key: `staging/${job}/media/talk.mp3`,
    });
    expect(Buffer.from(sent[0]?.input.Body as Uint8Array).toString()).toBe("ID3-fake-mp3");
    expect(sent[1]?.input).toEqual({
      TranscriptionJobName: job,
      Media: { MediaFileUri: `s3://audio-bucket/staging/${job}/media/talk.mp3` },
      MediaFormat: "mp3",
      OutputBucketName: "audio-bucket",
      OutputKey: `staging/${job}/transcript.json`,
      IdentifyLanguage: true,
    });
    expect(sent[3]?.input).toEqual({
      Bucket: "audio-bucket",
      Key: `staging/${job}/transcript.json`,
    });
    expect(sent.slice(4).map((c) => c.input.Key)).toEqual([
      `staging/${job}/media/talk.mp3`,
      `staging/${job}/transcript.json`,
    ]);
  });

  it("names the language it is given instead of identifying one", async () => {
    const { transcribe, s3, sent } = fakeClients();

    await createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 }).transcribe(
      audio,
      "audio/wav",
      { s3Uri: "s3://audio-bucket", languageCode: "de-DE" },
    );

    const start = sent.find((c) => c.name === "StartTranscriptionJobCommand")?.input ?? {};
    expect(start.LanguageCode).toBe("de-DE");
    expect(start.IdentifyLanguage).toBeUndefined();
    expect(start.MediaFormat).toBe("wav");
    expect(String(start.OutputKey)).toMatch(/^multimodal-[^/]+\/transcript\.json$/);
  });

  it("polls the job until it completes", async () => {
    const { transcribe, s3, sent } = fakeClients({ pending: 3 });

    await createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 }).transcribe(
      audio,
      "audio/mpeg",
      { s3Uri: S3_URI },
    );

    expect(sent.filter((c) => c.name === "GetTranscriptionJobCommand")).toHaveLength(4);
  });

  it("fails with the job's reason when it fails, and still deletes what it staged", async () => {
    const { transcribe, s3, sent } = fakeClients({
      final: { TranscriptionJobStatus: "FAILED", FailureReason: "Unsupported audio." },
    });

    await expect(
      createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 }).transcribe(
        audio,
        "audio/mpeg",
        { s3Uri: S3_URI },
      ),
    ).rejects.toThrow(/^Amazon Transcribe job multimodal-[^ ]+ failed: Unsupported audio\.$/);
    expect(sent.filter((c) => c.name === "DeleteObjectCommand")).toHaveLength(2);
    expect(sent.some((c) => c.name === "GetObjectCommand")).toBe(false);
  });

  it("fails at its timeout when the job has not finished", async () => {
    const { transcribe, s3, sent } = fakeClients({ pending: Number.POSITIVE_INFINITY });

    const error = await createTranscribeProvider({ transcribe, s3, pollIntervalMs: 5 })
      .transcribe(audio, "audio/mpeg", { s3Uri: S3_URI, timeoutMs: 30 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TranscriptionTimeoutError);
    expect(error).toMatchObject({ timeoutMs: 30 });
    expect(sent.filter((c) => c.name === "DeleteObjectCommand")).toHaveLength(2);
  });

  it("fails on a job that wrote no transcript, or one it cannot read", async () => {
    const empty = fakeClients({ transcript: null });
    await expect(
      createTranscribeProvider({
        transcribe: empty.transcribe,
        s3: empty.s3,
        pollIntervalMs: 1,
      }).transcribe(audio, "audio/mpeg", { s3Uri: S3_URI }),
    ).rejects.toThrow(/wrote no transcript$/);

    const malformed = fakeClients({ transcript: JSON.stringify({ results: {} }) });
    await expect(
      createTranscribeProvider({
        transcribe: malformed.transcribe,
        s3: malformed.s3,
        pollIntervalMs: 1,
      }).transcribe(audio, "audio/mpeg", { s3Uri: S3_URI }),
    ).rejects.toThrow();
  });

  it("logs a staged object it cannot delete and still returns the transcript", async () => {
    const { transcribe, s3 } = fakeClients({ failDelete: true });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 }).transcribe(
      audio,
      "audio/mpeg",
      { s3Uri: S3_URI },
    );

    expect(result.text).toBe("Hello there. Goodbye.");
    const warnings = log.mock.calls
      .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
      .filter((entry) => entry.level === "warn");
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ bucket: "audio-bucket", error: "AccessDenied" });
  });

  it("refuses an audio type Transcribe does not take, or a missing TRANSCRIBE_S3_URI, before calling AWS", async () => {
    const { transcribe, s3, sent } = fakeClients();
    const provider = createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 });

    await expect(provider.transcribe(audio, "audio/aiff", { s3Uri: S3_URI })).rejects.toThrow(
      "Amazon Transcribe takes no audio/aiff audio",
    );
    await expect(provider.transcribe(audio, "audio/mpeg", { s3Uri: "" })).rejects.toThrow(
      /^TRANSCRIBE_S3_URI must name/,
    );
    expect(sent).toHaveLength(0);
  });

  it("takes every audio type the audio processor accepts", () => {
    expect(Object.keys(MEDIA_FORMATS).sort()).toEqual(
      [
        "audio/flac",
        "audio/m4a",
        "audio/mp3",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
      ].sort(),
    );
  });

  it("opens its circuit breaker after five failed jobs and stops calling AWS", async () => {
    const { transcribe, s3, sent } = fakeClients({
      final: { TranscriptionJobStatus: "FAILED", FailureReason: "Unsupported audio." },
    });
    const provider = createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 });
    const call = () => provider.transcribe(audio, "audio/mpeg", { s3Uri: S3_URI });

    for (let i = 0; i < 5; i++) await expect(call()).rejects.toThrow(/failed/);
    const before = sent.length;
    await expect(call()).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(sent).toHaveLength(before);
  });

  it("leaves its circuit breaker closed on a misconfigured call", async () => {
    const { transcribe, s3 } = fakeClients();
    const provider = createTranscribeProvider({ transcribe, s3, pollIntervalMs: 1 });

    for (let i = 0; i < 6; i++) {
      await expect(provider.transcribe(audio, "audio/mpeg", { s3Uri: "" })).rejects.toThrow(
        /^TRANSCRIBE_S3_URI must name/,
      );
    }
    await expect(
      provider.transcribe(audio, "audio/mpeg", { s3Uri: S3_URI }),
    ).resolves.toMatchObject({ text: "Hello there. Goodbye." });
  });

  it("is registered as transcribe, one instance for every lookup", async () => {
    const { getTranscriptionProvider } = await import("../providers/index.js");
    expect(getTranscriptionProvider("transcribe")).toBe(getTranscriptionProvider("transcribe"));
    expect(() => getTranscriptionProvider("whisper")).toThrow(
      'Unknown transcription provider "whisper". Registered: transcribe',
    );
  });
});

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

describe("transcribe provider over the AWS SDK", () => {
  it("signs every call with the default chain's credentials and sends no provider key", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDTRANSCRIBETEST");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "transcribe-test-secret");
    vi.stubEnv("AWS_SESSION_TOKEN", "transcribe-test-session");
    vi.stubEnv("AWS_PROFILE", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");

    const received: Received[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        received.push({ method: req.method, url: req.url, headers: req.headers, body });
        const target = String(req.headers["x-amz-target"] ?? "");
        if (target.endsWith("StartTranscriptionJob")) {
          res.writeHead(200, { "content-type": "application/x-amz-json-1.1" });
          res.end(JSON.stringify({ TranscriptionJob: { TranscriptionJobStatus: "IN_PROGRESS" } }));
        } else if (target.endsWith("GetTranscriptionJob")) {
          res.writeHead(200, { "content-type": "application/x-amz-json-1.1" });
          res.end(
            JSON.stringify({
              TranscriptionJob: { TranscriptionJobStatus: "COMPLETED", LanguageCode: "en-US" },
            }),
          );
        } else if (req.method === "GET") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(TRANSCRIPT));
        } else {
          res.writeHead(req.method === "DELETE" ? 204 : 200);
          res.end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const transcribe = new TranscribeClient({
        region: DEFAULT_AWS_REGION,
        endpoint,
        maxAttempts: 1,
      });
      const s3 = new S3Client({
        region: DEFAULT_AWS_REGION,
        endpoint,
        forcePathStyle: true,
        maxAttempts: 1,
      });

      const result = await createTranscribeProvider({
        transcribe,
        s3,
        pollIntervalMs: 1,
      }).transcribe(audio, "audio/mpeg", { s3Uri: S3_URI });

      expect(result).toEqual({ text: "Hello there. Goodbye.", duration: 2.25, language: "en-US" });
      expect(received.map((r) => r.headers["x-amz-target"] ?? `${r.method} s3`)).toEqual([
        "PUT s3",
        "Transcribe.StartTranscriptionJob",
        "Transcribe.GetTranscriptionJob",
        "GET s3",
        "DELETE s3",
        "DELETE s3",
      ]);
      for (const request of received) {
        const service = request.headers["x-amz-target"] ? "transcribe" : "s3";
        expect(request.headers.authorization).toMatch(
          new RegExp(
            `^AWS4-HMAC-SHA256 Credential=AKIDTRANSCRIBETEST/\\d{8}/${DEFAULT_AWS_REGION}/${service}/`,
          ),
        );
        expect(request.headers["x-amz-security-token"]).toBe("transcribe-test-session");
        expect(request.headers["x-api-key"]).toBeUndefined();
      }
      expect(received[0]?.url).toMatch(
        /^\/audio-bucket\/staging\/multimodal-[^/]+\/media\/talk\.mp3/,
      );
      expect(JSON.stringify(received)).not.toMatch(/must-not-leave/);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
