import { describe, it, expect, beforeEach, vi } from "vitest";

// Import the memory provider module to trigger self-registration
import "../providers/memory.js";
import { getProvider } from "../providers/registry.js";
import type { CacheProvider } from "../providers/types.js";

describe("in-memory cache provider", () => {
  let provider: CacheProvider;

  beforeEach(async () => {
    provider = getProvider("memory");
    // Reset state between tests by closing (clears the store)
    await provider.close();
    await provider.init({});
  });

  it("is registered under the name 'memory'", () => {
    expect(provider.name).toBe("memory");
  });

  it("sets a value and retrieves it by key", async () => {
    await provider.set("greeting", "hello");

    const value = await provider.get("greeting");
    expect(value).toBe("hello");
  });

  it("returns undefined for a missing key", async () => {
    const value = await provider.get("nonexistent");

    expect(value).toBeUndefined();
  });

  it("overwrites an existing key", async () => {
    await provider.set("count", "1");
    await provider.set("count", "2");

    const value = await provider.get("count");
    expect(value).toBe("2");
  });

  it("deletes a key", async () => {
    await provider.set("temp", "value");

    await provider.delete("temp");

    const value = await provider.get("temp");
    expect(value).toBeUndefined();
  });

  it("reports existence with has()", async () => {
    await provider.set("exists", "yes");

    expect(await provider.has("exists")).toBe(true);
    expect(await provider.has("missing")).toBe(false);
  });

  it("clears all entries", async () => {
    await provider.set("a", "1");
    await provider.set("b", "2");

    await provider.clear();

    expect(await provider.get("a")).toBeUndefined();
    expect(await provider.get("b")).toBeUndefined();
  });

  it("expires entries after TTL elapses", async () => {
    vi.useFakeTimers();

    await provider.set("short-lived", "data", 100);

    // Still alive before TTL
    expect(await provider.get("short-lived")).toBe("data");
    expect(await provider.has("short-lived")).toBe(true);

    // Advance past TTL
    vi.advanceTimersByTime(150);

    expect(await provider.get("short-lived")).toBeUndefined();
    expect(await provider.has("short-lived")).toBe(false);

    vi.useRealTimers();
  });

  it("does not expire entries with no TTL", async () => {
    vi.useFakeTimers();

    await provider.set("forever", "persistent");

    vi.advanceTimersByTime(60_000);

    expect(await provider.get("forever")).toBe("persistent");

    vi.useRealTimers();
  });

  it("clears all entries on close", async () => {
    await provider.set("a", "1");
    await provider.set("b", "2");

    await provider.close();

    expect(await provider.get("a")).toBeUndefined();
    expect(await provider.get("b")).toBeUndefined();
  });
});
