import { describe, it, expect, vi } from "vitest";
import { createVariantTracker } from "../tracker.js";

describe("variant tracker", () => {
  it("records evaluations and reports pending count", () => {
    const tracker = createVariantTracker();

    tracker.record("flag-a", "treatment", "user-1");
    tracker.record("flag-b", "control", "user-2");

    expect(tracker.pending()).toBe(2);
  });

  it("flushes buffered records via callback", async () => {
    const flushed: unknown[] = [];
    const tracker = createVariantTracker({
      onFlush: async (records) => {
        flushed.push(...records);
      },
    });

    tracker.record("flag-a", "treatment", "user-1");
    tracker.record("flag-b", "control", "user-2");

    await tracker.flush();

    expect(flushed).toHaveLength(2);
    expect(tracker.pending()).toBe(0);
  });

  it("auto-flushes when buffer reaches capacity", async () => {
    const flushed: unknown[] = [];
    const tracker = createVariantTracker({
      bufferSize: 3,
      onFlush: async (records) => {
        flushed.push(...records);
      },
    });

    tracker.record("a", "v1", "u1");
    tracker.record("b", "v2", "u2");

    expect(flushed).toHaveLength(0);

    tracker.record("c", "v3", "u3"); // triggers auto-flush

    // Auto-flush is fire-and-forget, give it a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(flushed).toHaveLength(3);
  });

  it("flush is a no-op when buffer is empty", async () => {
    const onFlush = vi.fn();
    const tracker = createVariantTracker({ onFlush });

    await tracker.flush();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it("close flushes remaining records", async () => {
    const flushed: unknown[] = [];
    const tracker = createVariantTracker({
      onFlush: async (records) => {
        flushed.push(...records);
      },
    });

    tracker.record("flag-a", "treatment", "user-1");
    await tracker.close();

    expect(flushed).toHaveLength(1);
    expect(tracker.pending()).toBe(0);
  });

  it("records include timestamp and metadata", () => {
    const flushedRecords: Array<{
      flagKey: string;
      variant: string;
      userId?: string;
      metadata?: Record<string, unknown>;
      timestamp: string;
    }> = [];

    const tracker = createVariantTracker({
      onFlush: async (records) => {
        flushedRecords.push(...records);
      },
    });

    tracker.record("flag-a", "treatment", "user-1", { experimentId: "exp-1" });

    tracker.flush();

    // Give the flush callback a tick
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(flushedRecords).toHaveLength(1);
        expect(flushedRecords[0].flagKey).toBe("flag-a");
        expect(flushedRecords[0].metadata).toEqual({ experimentId: "exp-1" });
        expect(flushedRecords[0].timestamp).toBeTruthy();
        resolve();
      }, 10);
    });
  });
});
