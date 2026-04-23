import { describe, it, expect, beforeEach } from "vitest";

// Import the memory provider module to trigger self-registration
import "../providers/memory.js";
import { getProvider } from "../providers/registry.js";
import type { QueueProvider } from "../providers/types.js";

describe("in-memory queue provider", () => {
  let provider: QueueProvider;

  beforeEach(async () => {
    provider = getProvider("memory");
    // Reset state between tests by closing (clears jobs array + counter)
    await provider.close();
    await provider.init({});
  });

  it("is registered under the name 'memory'", () => {
    expect(provider.name).toBe("memory");
  });

  it("enqueues a job and returns an id", async () => {
    const id = await provider.enqueue("send-email", { to: "a@b.com" });

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
  });

  it("dequeues jobs in FIFO order (same priority)", async () => {
    await provider.enqueue("job-a", { order: 1 });
    await provider.enqueue("job-b", { order: 2 });
    await provider.enqueue("job-c", { order: 3 });

    const first = await provider.dequeue();
    const second = await provider.dequeue();
    const third = await provider.dequeue();

    expect(first!.name).toBe("job-a");
    expect(second!.name).toBe("job-b");
    expect(third!.name).toBe("job-c");
  });

  it("returns null when the queue is empty", async () => {
    const result = await provider.dequeue();

    expect(result).toBeNull();
  });

  it("acknowledges a job so it is not dequeued again", async () => {
    const id = await provider.enqueue("one-time", { x: 1 });

    const job = await provider.dequeue();
    expect(job).not.toBeNull();
    expect(job!.id).toBe(id);

    await provider.acknowledge(id);

    // Should not see the acknowledged job again
    const next = await provider.dequeue();
    expect(next).toBeNull();
  });

  it("respects priority ordering (lower number = higher priority)", async () => {
    await provider.enqueue("low", { p: "low" }, { priority: 10 });
    await provider.enqueue("high", { p: "high" }, { priority: 1 });
    await provider.enqueue("medium", { p: "medium" }, { priority: 5 });

    const first = await provider.dequeue();
    const second = await provider.dequeue();
    const third = await provider.dequeue();

    expect(first!.name).toBe("high");
    expect(second!.name).toBe("medium");
    expect(third!.name).toBe("low");
  });

  it("increments attempts on each dequeue", async () => {
    await provider.enqueue("retry-me", { x: 1 });

    const first = await provider.dequeue();
    expect(first!.attempts).toBe(1);

    // Fail to trigger re-enqueue, then dequeue again
    await provider.fail(first!.id, new Error("transient"));

    const second = await provider.dequeue();
    expect(second!.attempts).toBe(2);
  });

  it("marks job as failed after exhausting max retries", async () => {
    const id = await provider.enqueue("doomed", { x: 1 }, { maxRetries: 1 });

    const job = await provider.dequeue();
    expect(job!.id).toBe(id);

    // First failure — no retries left (attempts=1 === maxRetries=1)
    await provider.fail(id, new Error("permanent"));

    const next = await provider.dequeue();
    expect(next).toBeNull();
  });

  it("uses caller-supplied job ID when provided", async () => {
    const id = await provider.enqueue("custom-id", {}, { id: "my-id-123" });

    expect(id).toBe("my-id-123");

    const job = await provider.dequeue();
    expect(job!.id).toBe("my-id-123");
  });

  it("clears all jobs on close", async () => {
    await provider.enqueue("a", {});
    await provider.enqueue("b", {});

    await provider.close();

    const result = await provider.dequeue();
    expect(result).toBeNull();
  });
});
