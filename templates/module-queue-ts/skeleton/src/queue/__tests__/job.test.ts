import { describe, expect, it, vi } from "vitest";
import { buildJob, defineJob, resolveJobOptions } from "../job.js";

// ── Job helper tests ──────────────────────────────────────────────
//
// These decide what a job actually carries once it reaches a provider, and
// they are provider-agnostic — so a wrong default here is wrong in every
// backend at once, and shows up as "why did that job only retry once".

describe("resolveJobOptions", () => {
  it("applies every default when called with nothing", () => {
    expect(resolveJobOptions()).toEqual({ maxRetries: 3, delay: 0, priority: 0, id: "" });
  });

  it("keeps a caller value that happens to equal a falsy default", () => {
    // `??` rather than `||` is the whole correctness question here: with `||`,
    // an explicit `maxRetries: 0` ("do not retry this") would silently become
    // 3, and a `delay: 0` would be indistinguishable from unset.
    expect(resolveJobOptions({ maxRetries: 0, delay: 0, priority: 0 })).toEqual({
      maxRetries: 0,
      delay: 0,
      priority: 0,
      id: "",
    });
  });

  it("overrides only what is supplied", () => {
    expect(resolveJobOptions({ priority: 9 })).toEqual({
      maxRetries: 3,
      delay: 0,
      priority: 9,
      id: "",
    });
  });
});

describe("buildJob", () => {
  it("carries the name, payload and resolved options", () => {
    const job = buildJob("send-email", { to: "a@b.com" }, { maxRetries: 5, priority: 2 });
    expect(job.name).toBe("send-email");
    expect(job.data).toEqual({ to: "a@b.com" });
    expect(job.maxRetries).toBe(5);
    expect(job.priority).toBe(2);
    expect(job.attempts).toBe(0);
    expect(Number.isNaN(Date.parse(job.createdAt))).toBe(false);
  });

  it("uses the caller's id when one is given", () => {
    expect(buildJob("j", null, { id: "explicit-id" }).id).toBe("explicit-id");
  });

  it("synthesises a placeholder id when none is given", () => {
    // The id is `pending-` prefixed on purpose: the provider assigns the real
    // one, and a caller logging this value should be able to tell it apart
    // from a persisted id rather than chase a job that never had it.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.678Z"));
    try {
      expect(buildJob("j", null).id).toBe(`pending-${Date.parse("2026-01-02T03:04:05.678Z")}`);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("defineJob", () => {
  it("bakes the job name in and forwards data and options unchanged", async () => {
    const enqueue = vi.fn(async () => "job-1");
    const sendEmail = defineJob<{ to: string }>("send-email");

    const id = await sendEmail(enqueue, { to: "a@b.com" }, { priority: 4 });

    expect(id).toBe("job-1");
    // The point of the factory is that the call site cannot get the name
    // wrong, so the name is asserted positionally rather than loosely.
    expect(enqueue).toHaveBeenCalledWith("send-email", { to: "a@b.com" }, { priority: 4 });
  });

  it("passes no options through when the caller supplies none", async () => {
    const enqueue = vi.fn(async () => "job-2");
    await defineJob("reindex")(enqueue, { id: 7 });
    expect(enqueue).toHaveBeenCalledWith("reindex", { id: 7 }, undefined);
  });

  it("propagates an enqueue failure rather than swallowing it", async () => {
    const enqueue = vi.fn(async () => {
      throw new Error("broker unreachable");
    });
    await expect(defineJob("j")(enqueue, null)).rejects.toThrow("broker unreachable");
  });
});
