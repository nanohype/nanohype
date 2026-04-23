import { describe, it, expect, beforeEach } from "vitest";

// Import the memory store module to trigger self-registration
import "../stores/memory.js";
import { getStore } from "../stores/registry.js";
import type { RateLimitStore } from "../stores/types.js";

describe("in-memory rate limit store", () => {
  let store: RateLimitStore;

  beforeEach(async () => {
    store = getStore("memory");
    // Reset state between tests
    await store.close();
    await store.init({});
  });

  it("is registered under the name 'memory'", () => {
    expect(store.name).toBe("memory");
  });

  it("returns null for a key that does not exist", async () => {
    const value = await store.get("nonexistent");

    expect(value).toBeNull();
  });

  it("sets and gets a value", async () => {
    await store.set("counter", "42");

    const value = await store.get("counter");
    expect(value).toBe("42");
  });

  it("overwrites an existing value on set", async () => {
    await store.set("key", "first");
    await store.set("key", "second");

    const value = await store.get("key");
    expect(value).toBe("second");
  });

  it("increments a key that does not exist to 1", async () => {
    const value = await store.increment("new-counter");

    expect(value).toBe(1);
  });

  it("increments an existing key", async () => {
    await store.set("counter", "5");

    const value = await store.increment("counter");
    expect(value).toBe(6);
  });

  it("returns an empty array for a list that does not exist", async () => {
    const values = await store.getList("nonexistent-list");

    expect(values).toEqual([]);
  });

  it("appends to a list and retrieves all entries", async () => {
    await store.appendList("log", "1000");
    await store.appendList("log", "2000");
    await store.appendList("log", "3000");

    const values = await store.getList("log");
    expect(values).toEqual(["1000", "2000", "3000"]);
  });

  it("deletes a key", async () => {
    await store.set("temp", "value");
    await store.delete("temp");

    const value = await store.get("temp");
    expect(value).toBeNull();
  });

  it("deletes a list key", async () => {
    await store.appendList("temp-list", "a");
    await store.appendList("temp-list", "b");
    await store.delete("temp-list");

    const values = await store.getList("temp-list");
    expect(values).toEqual([]);
  });

  it("clears all data on close", async () => {
    await store.set("a", "1");
    await store.appendList("b", "2");

    await store.close();

    // Re-init after close
    await store.init({});

    expect(await store.get("a")).toBeNull();
    expect(await store.getList("b")).toEqual([]);
  });

  it("expires keys after TTL", async () => {
    // TTL is in milliseconds. Use a window wide enough to survive an
    // awaited get() without racing against expiry on a slow runner.
    await store.set("ephemeral", "value", 50);

    const immediate = await store.get("ephemeral");
    expect(immediate).toBe("value");

    await new Promise((resolve) => setTimeout(resolve, 75));

    const expired = await store.get("ephemeral");
    expect(expired).toBeNull();
  });
});
