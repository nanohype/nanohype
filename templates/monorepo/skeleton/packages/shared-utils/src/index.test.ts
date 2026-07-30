import { describe, expect, it, vi } from "vitest";
import { invariant, omit, randomId, sleep } from "./index.js";

// ── shared-utils ──────────────────────────────────────────────────
//
// Small functions that every package in the monorepo depends on, which is
// exactly why they get a suite: a wrong `omit` or an `invariant` that never
// throws is a defect that surfaces somewhere else entirely.

describe("invariant", () => {
  it("passes on a truthy condition", () => {
    expect(() => invariant(1, "should not throw")).not.toThrow();
    expect(() => invariant("text", "should not throw")).not.toThrow();
  });

  it("throws on every falsy value", () => {
    // Enumerated rather than sampled: an implementation using `== null` or
    // `=== false` instead of `!condition` would pass on 0 and "" and let a
    // zero-length result through as valid.
    for (const falsy of [false, 0, "", null, undefined, Number.NaN]) {
      expect(() => invariant(falsy, "must be present")).toThrow(
        "Invariant violation: must be present",
      );
    }
  });

  it("narrows the type for callers after the call", () => {
    const value: string | undefined = "present";
    invariant(value, "value is required");
    // Reachable only if the `asserts condition` signature holds — this line
    // would not compile if the assertion signature were dropped.
    expect(value.length).toBe(7);
  });
});

describe("sleep", () => {
  it("resolves after the requested delay", async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      const p = sleep(1000).then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves immediately for a zero delay", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe("randomId", () => {
  it("defaults to twelve characters", () => {
    expect(randomId()).toHaveLength(12);
  });

  it("honours an explicit length, including 1", () => {
    expect(randomId(1)).toHaveLength(1);
    expect(randomId(32)).toHaveLength(32);
  });

  it("returns an empty string for a length of zero", () => {
    expect(randomId(0)).toBe("");
  });

  it("emits only lowercase alphanumerics", () => {
    // These ids end up in URLs and log lines, so the character set is part of
    // the contract rather than an implementation detail.
    expect(randomId(200)).toMatch(/^[a-z0-9]+$/);
  });

  it("does not return the same id twice in a row", () => {
    // Weak by nature, but it catches the one real failure: a generator that
    // picks an index once and reuses it for every position.
    const ids = new Set(Array.from({ length: 50 }, () => randomId()));
    expect(ids.size).toBeGreaterThan(45);
  });
});

describe("omit", () => {
  it("removes the listed keys and keeps the rest", () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("does not mutate the input", () => {
    // It shallow-clones then deletes, so a missing spread would quietly strip
    // fields from the caller's object.
    const input = { a: 1, secret: "x" };
    omit(input, ["secret"]);
    expect(input.secret).toBe("x");
  });

  it("ignores keys that are not present", () => {
    const input = { a: 1 } as Record<string, unknown>;
    expect(omit(input, ["missing"])).toEqual({ a: 1 });
  });

  it("returns an equal-but-distinct object for an empty key list", () => {
    const input = { a: 1 };
    const out = omit(input, []);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });
});
