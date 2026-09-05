import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../providers/s3.js";
import { getProvider } from "../providers/registry.js";
import type { StorageProvider } from "../providers/types.js";
import { CircuitBreakerOpenError } from "../resilience/circuit-breaker.js";

// What the caller passes for region and endpoint, where the point is that the
// provider carries it through rather than substituting its own. Neither is a
// real region: the provider defaults to `us-east-1`, and asserting that a
// caller-supplied `us-east-1` arrives proves nothing, because the default
// produces the same value whether the caller's is read or dropped. A second
// real region would be one the LLM policy denies, and the region a storage test
// names carries no meaning of its own.
const CALLER_REGION = "caller-configured-region";
const CALLER_ENDPOINT = "https://s3.caller-configured.example";

// The AWS SDK is stubbed, so nothing here reaches the network or a credential
// chain. A presigned URL is a bearer credential — whoever holds it has the
// access it encodes until it expires — so what the suite pins is the request
// that would be signed: which client signs it, which command, which bucket and
// key, and for how long.
const aws = vi.hoisted(() => ({
  clients: [] as unknown[],
  send: vi.fn(),
  presign: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class StubCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }
  return {
    S3Client: class S3Client {
      readonly send = aws.send;
      constructor(readonly config: Record<string, unknown>) {
        aws.clients.push(this);
      }
    },
    PutObjectCommand: class PutObjectCommand extends StubCommand {},
    GetObjectCommand: class GetObjectCommand extends StubCommand {},
    DeleteObjectCommand: class DeleteObjectCommand extends StubCommand {},
    ListObjectsV2Command: class ListObjectsV2Command extends StubCommand {},
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: aws.presign,
}));

/** The command instance handed to the stubbed client on the nth send. */
function sentCommand(nth = 0): unknown {
  return aws.send.mock.calls[nth]?.[0];
}

/** The request shape a command carries, independent of the command class. */
function commandInput(command: unknown): Record<string, unknown> {
  return (command as { input: Record<string, unknown> }).input;
}

/** The config the provider passed to the S3Client constructor. */
function clientConfig(nth = 0): Record<string, unknown> {
  return (aws.clients[nth] as { config: Record<string, unknown> }).config;
}

/** A transient network failure: the class withRetry is required to retry. */
function transientFailure(): Error {
  return Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
}

/** A refusal no retry can fix: S3 answers 403 to a request it denies. */
function deniedFailure(): Error {
  return Object.assign(new Error("Access Denied"), { $metadata: { httpStatusCode: 403 } });
}

/**
 * Upper bound on X-Amz-Expires in the AWS SigV4 query-parameter signing
 * specification: a presigned URL may not outlive seven days.
 */
const MAX_PRESIGN_SECONDS = 604_800;

/**
 * An S3 key is an opaque sequence of UTF-8 bytes: the specification makes case
 * significant, and a leading slash, an interior space and a non-ASCII character
 * are all legal and all distinct from their normalized forms. A key that
 * survives lowercasing, trimming or slash-stripping cannot show which of the
 * two a request carried, so every request here uses one that does not.
 */
const KEY = "/Reports/2024-Q3 Übersicht FINAL.pdf ";
const METADATA_KEY = "/Reports/2024-Q3 Übersicht FINAL.json ";
const MISSING_KEY = "/Reports/2024-Q3 Übersicht ABSENT.pdf ";
const PREFIX = "/Reports/";

/** Failures within the window that open a breaker built by createCircuitBreaker. */
const CIRCUIT_FAILURE_THRESHOLD = 5;

/**
 * The whole backoff budget withRetry can spend: a 200 ms base doubling across
 * three retries, each scaled by jitter that only shortens the wait.
 */
const RETRY_BACKOFF_BUDGET_MS = 1_400;

/** The config every operation below is driven against. */
const INIT = { bucket: "assets" };

/**
 * An upload body larger than any plausible per-call cap. `toBuffer` already
 * carries the size limit this module intends; a narrower one passed at the call
 * site rejects a body this size, and a fixture of a few bytes fits under either
 * limit and so cannot tell them apart.
 */
const LARGE_BODY = Buffer.from("payload-".repeat(128 * 1024), "utf-8");

/** A stubbed command class, matched against the command the provider sent. */
type CommandClass = new (...args: never[]) => object;

/**
 * Every provider call that reaches the network, each paired with a response
 * shape that lets it return normally. The breaker and the retry guard the
 * transport, not one verb, so the assertions below run over this table rather
 * than over whichever operation is written first: an operation wired straight
 * to the client still executes every line it owns, so coverage cannot tell it
 * apart from one that is guarded.
 *
 * getSignedUrl is absent because it reaches nothing — it computes a signature
 * locally and returns a URL.
 */
const NETWORK_OPERATIONS: readonly {
  readonly operation: string;
  readonly command: CommandClass;
  readonly respond: () => Record<string, unknown>;
  readonly call: (provider: StorageProvider) => Promise<unknown>;
}[] = [
  {
    operation: "upload",
    command: PutObjectCommand,
    respond: () => ({}),
    call: (provider) => provider.upload(KEY, "hello"),
  },
  {
    operation: "download",
    command: GetObjectCommand,
    respond: () => ({ Body: Readable.from([Buffer.from("part-one/"), Buffer.from("part-two")]) }),
    call: (provider) => provider.download(KEY),
  },
  {
    operation: "delete",
    command: DeleteObjectCommand,
    respond: () => ({}),
    call: (provider) => provider.delete(KEY),
  },
  {
    operation: "list",
    command: ListObjectsV2Command,
    respond: () => ({}),
    call: (provider) => provider.list(PREFIX, { maxKeys: 10, cursor: "page-1" }),
  },
];

describe("s3 storage provider", () => {
  let provider: StorageProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    aws.clients.length = 0;
    provider = getProvider("s3");
  });

  it("is registered under the name 's3'", () => {
    expect(provider.name).toBe("s3");
  });

  it("drives every request with a key that normalizing would visibly change", () => {
    for (const key of [KEY, METADATA_KEY, MISSING_KEY]) {
      expect(key).not.toBe(key.toLowerCase());
      expect(key).not.toBe(key.toUpperCase());
      expect(key).not.toBe(key.trim());
      expect(key).not.toBe(key.replace(/^\/+/, ""));
      expect(key).not.toBe(key.normalize("NFD"));
    }
  });

  describe("init", () => {
    it("defaults to us-east-1 with neither an endpoint nor a path-style override", async () => {
      await provider.init({ bucket: "assets" });

      expect(clientConfig()).toEqual({ region: "us-east-1" });
    });

    it("uses the caller's region, endpoint and path-style flag", async () => {
      await provider.init({
        bucket: "assets",
        region: CALLER_REGION,
        endpoint: CALLER_ENDPOINT,
        forcePathStyle: true,
      });

      expect(clientConfig()).toEqual({
        region: CALLER_REGION,
        endpoint: CALLER_ENDPOINT,
        forcePathStyle: true,
      });
    });

    it("never injects credentials from config, leaving the SDK credential chain in charge", async () => {
      await provider.init({
        bucket: "assets",
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "s3cr3t",
      });

      expect(clientConfig()).not.toHaveProperty("credentials");
      expect(clientConfig()).not.toHaveProperty("accessKeyId");
      expect(clientConfig()).not.toHaveProperty("secretAccessKey");
    });
  });

  describe("upload", () => {
    it("puts the buffered body under the configured bucket and the given key", async () => {
      await provider.init({ bucket: "assets" });

      await provider.upload(KEY, "hello");

      const command = sentCommand();
      expect(command).toBeInstanceOf(PutObjectCommand);
      const input = commandInput(command);
      expect(input.Bucket).toBe("assets");
      expect(input.Key).toBe(KEY);
      expect(Buffer.isBuffer(input.Body)).toBe(true);
      expect((input.Body as Buffer).toString("utf-8")).toBe("hello");
      expect(input.ContentType).toBeUndefined();
      expect(input.Metadata).toBeUndefined();
    });

    it("writes the key byte for byte, since S3 resolves keys case-sensitively", async () => {
      await provider.init({ bucket: "assets" });

      await provider.upload(KEY, "hello");

      // Not a `toEqual` on the whole input: the point is the exact bytes of the
      // key, since a normalized one lands where no reader will look for it.
      expect(commandInput(sentCommand()).Key).toBe(KEY);
    });

    it("forwards the content type and metadata the caller supplied", async () => {
      await provider.init({ bucket: "assets" });

      await provider.upload(METADATA_KEY, Buffer.from("{}"), {
        contentType: "application/json",
        metadata: { owner: "billing" },
      });

      const input = commandInput(sentCommand());
      expect(input.Key).toBe(METADATA_KEY);
      expect(input.ContentType).toBe("application/json");
      expect(input.Metadata).toEqual({ owner: "billing" });
    });

    it("sends the whole body, under no size limit narrower than the shared default", async () => {
      await provider.init(INIT);

      await provider.upload(KEY, LARGE_BODY);

      const body = commandInput(sentCommand()).Body as Buffer;
      expect(body.length).toBe(LARGE_BODY.length);
      expect(body.equals(LARGE_BODY)).toBe(true);
    });

    it("retries a transient network failure instead of surfacing it to the caller", async () => {
      await provider.init({ bucket: "assets" });
      aws.send.mockRejectedValueOnce(transientFailure()).mockResolvedValue({});

      vi.useFakeTimers();
      try {
        const uploaded = expect(provider.upload(KEY, "hello")).resolves.toBeUndefined();
        await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_BUDGET_MS);
        await uploaded;
      } finally {
        vi.useRealTimers();
      }

      expect(aws.send).toHaveBeenCalledTimes(2);
      expect(commandInput(sentCommand(1))).toEqual(commandInput(sentCommand(0)));
    });

    it("opens the breaker after repeated failures and then writes nothing at all", async () => {
      await provider.init({ bucket: "assets" });
      aws.send.mockRejectedValue(deniedFailure());

      for (let attempt = 0; attempt < CIRCUIT_FAILURE_THRESHOLD; attempt++) {
        await expect(provider.upload(KEY, "hello")).rejects.toThrow("Access Denied");
      }
      // A denial is not retryable, so each attempt cost exactly one send.
      expect(aws.send).toHaveBeenCalledTimes(CIRCUIT_FAILURE_THRESHOLD);

      await expect(provider.upload(KEY, "hello")).rejects.toBeInstanceOf(CircuitBreakerOpenError);
      expect(aws.send).toHaveBeenCalledTimes(CIRCUIT_FAILURE_THRESHOLD);
    });
  });

  describe("download", () => {
    it("concatenates a body delivered as Buffer chunks", async () => {
      await provider.init({ bucket: "assets" });
      aws.send.mockResolvedValue({
        Body: Readable.from([Buffer.from("part-one/"), Buffer.from("part-two")]),
      });

      const data = await provider.download(KEY);

      expect(data.toString("utf-8")).toBe("part-one/part-two");
      const command = sentCommand();
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(commandInput(command)).toEqual({ Bucket: "assets", Key: KEY });
    });

    it("coerces chunks that arrive as strings rather than Buffers", async () => {
      await provider.init({ bucket: "assets" });
      aws.send.mockResolvedValue({ Body: Readable.from(["alpha", "beta"]) });

      const data = await provider.download(KEY);

      expect(data.toString("utf-8")).toBe("alphabeta");
    });

    it("rejects when the response carries no body", async () => {
      await provider.init({ bucket: "assets" });
      aws.send.mockResolvedValue({});

      await expect(provider.download(MISSING_KEY)).rejects.toThrow(
        `Empty response body for key "${MISSING_KEY}"`,
      );
    });
  });

  describe("delete", () => {
    it("deletes the given key from the configured bucket", async () => {
      await provider.init({ bucket: "assets" });

      await provider.delete(KEY);

      const command = sentCommand();
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(commandInput(command)).toEqual({ Bucket: "assets", Key: KEY });
    });
  });

  describe("list", () => {
    it("lists the whole bucket and returns an empty page when it holds nothing", async () => {
      await provider.init({ bucket: "assets" });
      aws.send.mockResolvedValue({});

      const result = await provider.list();

      const command = sentCommand();
      expect(command).toBeInstanceOf(ListObjectsV2Command);
      expect(commandInput(command)).toEqual({
        Bucket: "assets",
        Prefix: undefined,
        MaxKeys: undefined,
        ContinuationToken: undefined,
      });
      expect(result).toEqual({ objects: [], nextCursor: undefined });
    });

    it("passes the prefix and page options through and maps the returned contents", async () => {
      await provider.init({ bucket: "assets" });
      const lastModified = new Date("2024-03-01T00:00:00.000Z");
      aws.send.mockResolvedValue({
        Contents: [{ Key: KEY, Size: 12, LastModified: lastModified, ETag: '"abc"' }],
        NextContinuationToken: "page-2",
      });

      const result = await provider.list(PREFIX, { maxKeys: 10, cursor: "page-1" });

      expect(commandInput(sentCommand())).toEqual({
        Bucket: "assets",
        Prefix: PREFIX,
        MaxKeys: 10,
        ContinuationToken: "page-1",
      });
      expect(result).toEqual({
        objects: [{ key: KEY, size: 12, lastModified, etag: '"abc"' }],
        nextCursor: "page-2",
      });
    });
  });

  describe("getSignedUrl", () => {
    it("presigns a read of the configured bucket and the given key for the caller's lifetime", async () => {
      await provider.init({ bucket: "assets" });
      aws.presign.mockResolvedValue("https://assets.example/docs/report.txt?X-Amz-Signature=x");

      const url = await provider.getSignedUrl(KEY, 900);

      expect(url).toBe("https://assets.example/docs/report.txt?X-Amz-Signature=x");
      expect(aws.presign).toHaveBeenCalledTimes(1);
      const [client, command, options] = aws.presign.mock.calls[0];
      expect(client).toBe(aws.clients[0]);
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(commandInput(command)).toEqual({ Bucket: "assets", Key: KEY });
      expect(options).toEqual({ expiresIn: 900 });
    });

    it("never presigns a write", async () => {
      await provider.init({ bucket: "assets" });
      aws.presign.mockResolvedValue("https://assets.example/x");

      await provider.getSignedUrl(KEY);

      expect(aws.presign.mock.calls[0][1]).not.toBeInstanceOf(PutObjectCommand);
    });

    it("falls back to a default lifetime the SigV4 specification permits", async () => {
      await provider.init({ bucket: "assets" });
      aws.presign.mockResolvedValue("https://assets.example/x");

      await provider.getSignedUrl(KEY);

      const options = aws.presign.mock.calls[0][2] as { expiresIn: number };
      expect(options.expiresIn).toBe(3600);
      expect(Number.isInteger(options.expiresIn)).toBe(true);
      expect(options.expiresIn).toBeGreaterThanOrEqual(1);
      expect(options.expiresIn).toBeLessThanOrEqual(MAX_PRESIGN_SECONDS);
    });

    it("signs against the endpoint and region the caller configured", async () => {
      await provider.init({
        bucket: "assets",
        region: CALLER_REGION,
        endpoint: CALLER_ENDPOINT,
      });
      aws.presign.mockResolvedValue("https://assets.example/x");

      await provider.getSignedUrl(KEY);

      const client = aws.presign.mock.calls[0][0] as { config: Record<string, unknown> };
      expect(client).toBe(aws.clients[0]);
      expect(client.config.region).toBe(CALLER_REGION);
      expect(client.config.endpoint).toBe(CALLER_ENDPOINT);
    });
  });

  describe("resilience", () => {
    describe.each(NETWORK_OPERATIONS)("$operation", ({ command, respond, call }) => {
      it("retries a transient network failure instead of surfacing it to the caller", async () => {
        await provider.init(INIT);
        aws.send
          .mockRejectedValueOnce(transientFailure())
          .mockImplementation(async () => respond());

        vi.useFakeTimers();
        try {
          const settled = call(provider);
          await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_BUDGET_MS);
          await settled;
        } finally {
          vi.useRealTimers();
        }

        // The retry re-sends the same request, not a fresh one built from
        // whatever state the failed attempt left behind.
        expect(aws.send).toHaveBeenCalledTimes(2);
        expect(sentCommand(1)).toBeInstanceOf(command);
        expect(commandInput(sentCommand(1))).toEqual(commandInput(sentCommand(0)));
      });

      it("opens the breaker after repeated failures and then sends nothing at all", async () => {
        await provider.init(INIT);
        aws.send.mockRejectedValue(deniedFailure());

        for (let attempt = 0; attempt < CIRCUIT_FAILURE_THRESHOLD; attempt++) {
          await expect(call(provider)).rejects.toThrow("Access Denied");
        }
        // A denial is not retryable, so each attempt cost exactly one send.
        expect(aws.send).toHaveBeenCalledTimes(CIRCUIT_FAILURE_THRESHOLD);

        await expect(call(provider)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
        expect(aws.send).toHaveBeenCalledTimes(CIRCUIT_FAILURE_THRESHOLD);
      });
    });
  });
});
