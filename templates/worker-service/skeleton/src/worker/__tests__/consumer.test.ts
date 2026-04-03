import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createQueueConsumer } from "../consumer/handler.js";
import type { QueueProvider, HandlerMap } from "../consumer/types.js";
import type { JobDefinition } from "../types.js";
import { createLogger } from "../logger.js";

// ── Test Helpers ──────────────────────────────────────────────────

function createMockProvider(jobs: JobDefinition[] = []): QueueProvider {
  const queue = [...jobs];
  const acknowledged: string[] = [];
  const failed: Array<{ id: string; error: Error }> = [];

  return {
    name: "mock",
    async init() {},
    async enqueue(name, data) {
      const id = `mock-${queue.length + 1}`;
      queue.push({
        id,
        name,
        data,
        attempts: 0,
        maxRetries: 3,
        createdAt: new Date().toISOString(),
      });
      return id;
    },
    async dequeue() {
      return queue.shift() ?? null;
    },
    async acknowledge(jobId) {
      acknowledged.push(jobId);
    },
    async fail(jobId, error) {
      failed.push({ id: jobId, error });
    },
    async close() {},
    // Expose internals for assertions
    get _acknowledged() {
      return acknowledged;
    },
    get _failed() {
      return failed;
    },
  } as QueueProvider & { _acknowledged: string[]; _failed: Array<{ id: string; error: Error }> };
}

function makeJob(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id: "job-1",
    name: "test-job",
    data: { value: 42 },
    attempts: 1,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Consumer Tests ────────────────────────────────────────────────

describe("QueueConsumer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches a job to the correct handler", async () => {
    const job = makeJob();
    const provider = createMockProvider([job]);
    const handler = vi.fn().mockResolvedValue(undefined);
    const handlers: HandlerMap = { "test-job": handler };
    const logger = createLogger("error", "test");

    const consumer = createQueueConsumer(provider, handlers, logger, {
      pollInterval: 100,
    });

    consumer.start();
    await vi.advanceTimersByTimeAsync(200);
    await consumer.stop(1000);

    expect(handler).toHaveBeenCalledWith(job);
  });

  it("acknowledges successful jobs", async () => {
    const job = makeJob();
    const provider = createMockProvider([job]) as QueueProvider & {
      _acknowledged: string[];
    };
    const handlers: HandlerMap = {
      "test-job": vi.fn().mockResolvedValue(undefined),
    };
    const logger = createLogger("error", "test");

    const consumer = createQueueConsumer(provider, handlers, logger, {
      pollInterval: 100,
    });

    consumer.start();
    await vi.advanceTimersByTimeAsync(200);
    await consumer.stop(1000);

    expect(provider._acknowledged).toContain("job-1");
  });

  it("fails jobs with no registered handler", async () => {
    const job = makeJob({ name: "unknown-job" });
    const provider = createMockProvider([job]) as QueueProvider & {
      _failed: Array<{ id: string; error: Error }>;
    };
    const handlers: HandlerMap = {};
    const logger = createLogger("error", "test");

    const consumer = createQueueConsumer(provider, handlers, logger, {
      pollInterval: 100,
    });

    consumer.start();
    await vi.advanceTimersByTimeAsync(200);
    await consumer.stop(1000);

    expect(provider._failed).toHaveLength(1);
    expect(provider._failed[0]!.id).toBe("job-1");
  });

  it("fails jobs when handler throws", async () => {
    const job = makeJob();
    const provider = createMockProvider([job]) as QueueProvider & {
      _failed: Array<{ id: string; error: Error }>;
    };
    const handlers: HandlerMap = {
      "test-job": vi.fn().mockRejectedValue(new Error("handler error")),
    };
    const logger = createLogger("error", "test");

    const consumer = createQueueConsumer(provider, handlers, logger, {
      pollInterval: 100,
    });

    consumer.start();
    await vi.advanceTimersByTimeAsync(200);
    await consumer.stop(1000);

    expect(provider._failed).toHaveLength(1);
    expect(provider._failed[0]!.error.message).toBe("handler error");
  });

  it("reports polling state", async () => {
    const provider = createMockProvider();
    const logger = createLogger("error", "test");

    const consumer = createQueueConsumer(provider, {}, logger);

    expect(consumer.polling).toBe(false);

    consumer.start();
    expect(consumer.polling).toBe(true);

    await consumer.stop(1000);
    expect(consumer.polling).toBe(false);
  });

  it("processes multiple jobs in sequence", async () => {
    const jobs = [
      makeJob({ id: "job-1", name: "task-a" }),
      makeJob({ id: "job-2", name: "task-b" }),
    ];
    const provider = createMockProvider(jobs) as QueueProvider & {
      _acknowledged: string[];
    };
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);
    const handlers: HandlerMap = { "task-a": handlerA, "task-b": handlerB };
    const logger = createLogger("error", "test");

    const consumer = createQueueConsumer(provider, handlers, logger, {
      pollInterval: 100,
      concurrency: 1,
    });

    consumer.start();
    await vi.advanceTimersByTimeAsync(500);
    await consumer.stop(1000);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(provider._acknowledged).toEqual(["job-1", "job-2"]);
  });
});
