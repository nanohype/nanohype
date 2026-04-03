import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEventBuffer } from "../buffer/event-buffer.js";

// ── Event Buffer Tests ───────────────────────────────────────────
//
// Validates capacity flush, interval flush, close drains remaining
// events, and independent instances.
//

describe("createEventBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes at capacity", async () => {
    const batches: Record<string, unknown>[][] = [];
    const buffer = createEventBuffer({
      maxSize: 3,
      flushIntervalMs: 60_000,
      onFlush: async (events) => {
        batches.push([...events]);
      },
    });

    buffer.add({ event: "a" });
    buffer.add({ event: "b" });
    buffer.add({ event: "c" }); // triggers capacity flush

    // Allow microtask to complete
    await vi.advanceTimersByTimeAsync(0);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);

    await buffer.close();
  });

  it("flushes on interval", async () => {
    const batches: Record<string, unknown>[][] = [];
    const buffer = createEventBuffer({
      maxSize: 100,
      flushIntervalMs: 1000,
      onFlush: async (events) => {
        batches.push([...events]);
      },
    });

    buffer.add({ event: "a" });
    buffer.add({ event: "b" });

    // Advance past flush interval
    await vi.advanceTimersByTimeAsync(1100);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);

    await buffer.close();
  });

  it("close drains remaining events", async () => {
    const batches: Record<string, unknown>[][] = [];
    const buffer = createEventBuffer({
      maxSize: 100,
      flushIntervalMs: 60_000,
      onFlush: async (events) => {
        batches.push([...events]);
      },
    });

    buffer.add({ event: "a" });
    buffer.add({ event: "b" });

    expect(batches).toHaveLength(0);

    await buffer.close();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("does not flush when empty", async () => {
    const batches: Record<string, unknown>[][] = [];
    const buffer = createEventBuffer({
      maxSize: 100,
      flushIntervalMs: 1000,
      onFlush: async (events) => {
        batches.push([...events]);
      },
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(batches).toHaveLength(0);

    await buffer.close();

    // close() with empty buffer should not flush either
    expect(batches).toHaveLength(0);
  });

  it("creates independent instances", async () => {
    const batchesA: Record<string, unknown>[][] = [];
    const batchesB: Record<string, unknown>[][] = [];

    const bufferA = createEventBuffer({
      maxSize: 2,
      flushIntervalMs: 60_000,
      onFlush: async (events) => {
        batchesA.push([...events]);
      },
    });

    const bufferB = createEventBuffer({
      maxSize: 2,
      flushIntervalMs: 60_000,
      onFlush: async (events) => {
        batchesB.push([...events]);
      },
    });

    bufferA.add({ event: "a1" });
    bufferA.add({ event: "a2" }); // triggers flush

    await vi.advanceTimersByTimeAsync(0);

    expect(batchesA).toHaveLength(1);
    expect(batchesB).toHaveLength(0);

    bufferB.add({ event: "b1" });

    await bufferA.close();
    await bufferB.close();

    expect(batchesB).toHaveLength(1);
    expect(batchesB[0]).toHaveLength(1);
  });

  it("reports current buffer size", async () => {
    const buffer = createEventBuffer({
      maxSize: 100,
      flushIntervalMs: 60_000,
      onFlush: async () => {},
    });

    expect(buffer.size).toBe(0);

    buffer.add({ event: "a" });
    expect(buffer.size).toBe(1);

    buffer.add({ event: "b" });
    expect(buffer.size).toBe(2);

    await buffer.close();
  });
});
