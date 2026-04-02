import { describe, it, expect, beforeEach } from "vitest";

// Import the memory provider so it self-registers
import "../providers/memory.js";
import { createQueue, type Queue } from "../index.js";

// ── Integration Tests ───────────────────────────────────────────────
//
// Full lifecycle tests using createQueue() — the public API. Exercises
// the queue facade, provider initialization, enqueue/dequeue/ack/fail
// cycle, and error handling for invalid providers.

describe("queue integration — memory provider", () => {
  let queue: Queue;

  beforeEach(async () => {
    queue = await createQueue("memory");
  });

  it("enqueue → dequeue → acknowledge → dequeue returns null", async () => {
    const jobId = await queue.enqueue("send-email", {
      to: "test@example.com",
    });
    expect(jobId).toBeDefined();

    // Dequeue the job
    const job = await queue.provider.dequeue();
    expect(job).not.toBeNull();
    expect(job!.id).toBe(jobId);
    expect(job!.name).toBe("send-email");
    expect(job!.data).toEqual({ to: "test@example.com" });

    // Acknowledge it
    await queue.provider.acknowledge(jobId);

    // Verify it cannot be dequeued again
    const next = await queue.provider.dequeue();
    expect(next).toBeNull();
  });

  it("enqueue → dequeue → fail → job is re-enqueued for retry", async () => {
    const jobId = await queue.enqueue(
      "flaky-task",
      { attempt: true },
      { maxRetries: 3 }
    );

    // First dequeue
    const first = await queue.provider.dequeue();
    expect(first).not.toBeNull();
    expect(first!.id).toBe(jobId);
    expect(first!.attempts).toBe(1);

    // Fail the job — should be re-enqueued because attempts < maxRetries
    await queue.provider.fail(jobId, new Error("transient failure"));

    // Second dequeue — same job, incremented attempts
    const second = await queue.provider.dequeue();
    expect(second).not.toBeNull();
    expect(second!.id).toBe(jobId);
    expect(second!.attempts).toBe(2);
  });

  it("throws with available providers listed for invalid provider name", async () => {
    await expect(createQueue("nonexistent-provider")).rejects.toThrow(
      /not found/
    );
    await expect(createQueue("nonexistent-provider")).rejects.toThrow(
      /Available/
    );
  });
});
