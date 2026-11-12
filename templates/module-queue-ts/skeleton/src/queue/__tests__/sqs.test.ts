import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "../providers/registry.js";
import "../providers/sqs.js";

// Records what the provider builds its client with. Only the AWS SDK is faked;
// the provider and the registry run as they ship.
const clientOptions: Record<string, unknown>[] = [];

vi.mock("@aws-sdk/client-sqs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    SQSClient: class {
      constructor(options: Record<string, unknown>) {
        clientOptions.push(options);
      }
      send = vi.fn(async () => ({}));
      destroy = vi.fn();
    },
  };
});

describe("sqs provider init", () => {
  afterEach(async () => {
    await getProvider("sqs").close();
    clientOptions.length = 0;
    vi.unstubAllEnvs();
  });

  it("requires a queue url", async () => {
    vi.stubEnv("SQS_QUEUE_URL", "");
    await expect(getProvider("sqs").init({})).rejects.toThrow(/queueUrl/);
  });

  it("opens its client on the region the config names", async () => {
    await getProvider("sqs").init({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/111111111111/jobs.fifo",
      region: "us-east-1",
    });

    expect(clientOptions).toHaveLength(1);
    expect(clientOptions[0]).toMatchObject({ region: "us-east-1" });
  });

  it("keeps calls on the configured endpoint, not the queue URL's host", async () => {
    // With the SDK default, a client whose endpoint comes from
    // AWS_ENDPOINT_URL_SQS sends each call to the host inside the QueueUrl
    // instead, so an AWS queue URL would carry jobs to AWS while the rest of
    // the process talks to the configured endpoint.
    await getProvider("sqs").init({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/111111111111/jobs.fifo",
      region: "us-east-1",
    });

    expect(clientOptions[0]).toMatchObject({ useQueueUrlAsEndpoint: false });
  });
});
