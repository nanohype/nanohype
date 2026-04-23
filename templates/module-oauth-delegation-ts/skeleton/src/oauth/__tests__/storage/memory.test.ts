import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryTokenStorage } from "../../storage/memory.js";

describe("InMemoryTokenStorage", () => {
  let storage: InMemoryTokenStorage;

  beforeEach(() => {
    storage = new InMemoryTokenStorage();
  });

  it("round-trips a grant for a (userId, provider) pair", async () => {
    await storage.put("u1", "notion", { accessToken: "A" });
    expect(await storage.get("u1", "notion")).toEqual({ accessToken: "A" });
  });

  it("returns null for a missing pair", async () => {
    expect(await storage.get("u1", "notion")).toBeNull();
  });

  it("isolates per-user + per-provider", async () => {
    await storage.put("u1", "notion", { accessToken: "notion-A" });
    await storage.put("u1", "google", { accessToken: "google-A" });
    await storage.put("u2", "notion", { accessToken: "notion-B" });

    expect((await storage.get("u1", "notion"))?.accessToken).toBe("notion-A");
    expect((await storage.get("u1", "google"))?.accessToken).toBe("google-A");
    expect((await storage.get("u2", "notion"))?.accessToken).toBe("notion-B");
  });

  it("delete removes a single pair", async () => {
    await storage.put("u1", "notion", { accessToken: "A" });
    await storage.put("u1", "google", { accessToken: "B" });
    await storage.delete("u1", "notion");
    expect(await storage.get("u1", "notion")).toBeNull();
    expect((await storage.get("u1", "google"))?.accessToken).toBe("B");
  });

  it("delete is a no-op when absent", async () => {
    await expect(storage.delete("nobody", "notion")).resolves.toBeUndefined();
  });

  it("deleteAllForUser wipes every provider under a user", async () => {
    await storage.put("u1", "notion", { accessToken: "A" });
    await storage.put("u1", "google", { accessToken: "B" });
    await storage.put("u2", "notion", { accessToken: "C" });

    await storage.deleteAllForUser("u1");

    expect(await storage.get("u1", "notion")).toBeNull();
    expect(await storage.get("u1", "google")).toBeNull();
    expect((await storage.get("u2", "notion"))?.accessToken).toBe("C");
    expect(storage._size()).toBe(1);
  });
});
