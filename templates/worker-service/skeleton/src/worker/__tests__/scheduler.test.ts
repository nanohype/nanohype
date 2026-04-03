import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseField,
  parseCronExpression,
  cronMatches,
  createCronScheduler,
} from "../scheduler/cron.js";
import { createLogger } from "../logger.js";

// ── Cron Expression Parsing ───────────────────────────────────────

describe("parseField", () => {
  it("parses wildcard", () => {
    const field = parseField("*", 0, 59);
    expect(field.wildcard).toBe(true);
  });

  it("parses single value", () => {
    const field = parseField("5", 0, 59);
    expect(field.wildcard).toBe(false);
    expect(field.values).toEqual(new Set([5]));
  });

  it("parses comma-separated list", () => {
    const field = parseField("1,3,5", 0, 59);
    expect(field.values).toEqual(new Set([1, 3, 5]));
  });

  it("parses range", () => {
    const field = parseField("1-5", 0, 59);
    expect(field.values).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("parses step on wildcard", () => {
    const field = parseField("*/15", 0, 59);
    expect(field.values).toEqual(new Set([0, 15, 30, 45]));
  });

  it("parses step on range", () => {
    const field = parseField("1-10/3", 0, 59);
    expect(field.values).toEqual(new Set([1, 4, 7, 10]));
  });

  it("throws on out-of-range value", () => {
    expect(() => parseField("60", 0, 59)).toThrow("Invalid cron value");
  });

  it("throws on invalid range", () => {
    expect(() => parseField("5-3", 0, 59)).toThrow("Invalid cron range");
  });
});

describe("parseCronExpression", () => {
  it("parses standard 5-field expression", () => {
    const cron = parseCronExpression("*/5 * * * *");
    expect(cron.minute.values).toEqual(new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]));
    expect(cron.hour.wildcard).toBe(true);
  });

  it("throws on wrong number of fields", () => {
    expect(() => parseCronExpression("* * *")).toThrow("expected 5 fields");
  });

  it("parses every-minute expression", () => {
    const cron = parseCronExpression("* * * * *");
    expect(cron.minute.wildcard).toBe(true);
    expect(cron.hour.wildcard).toBe(true);
    expect(cron.dayOfMonth.wildcard).toBe(true);
    expect(cron.month.wildcard).toBe(true);
    expect(cron.dayOfWeek.wildcard).toBe(true);
  });
});

// ── Cron Matching ─────────────────────────────────────────────────

describe("cronMatches", () => {
  it("matches every-minute expression to any date", () => {
    const cron = parseCronExpression("* * * * *");
    expect(cronMatches(cron, new Date(2025, 0, 1, 12, 30))).toBe(true);
  });

  it("matches specific minute", () => {
    const cron = parseCronExpression("30 * * * *");
    expect(cronMatches(cron, new Date(2025, 0, 1, 12, 30))).toBe(true);
    expect(cronMatches(cron, new Date(2025, 0, 1, 12, 15))).toBe(false);
  });

  it("matches specific hour and minute", () => {
    const cron = parseCronExpression("0 9 * * *");
    expect(cronMatches(cron, new Date(2025, 0, 1, 9, 0))).toBe(true);
    expect(cronMatches(cron, new Date(2025, 0, 1, 10, 0))).toBe(false);
  });

  it("matches day of week", () => {
    // January 6, 2025 is a Monday (day 1)
    const cron = parseCronExpression("0 0 * * 1");
    expect(cronMatches(cron, new Date(2025, 0, 6, 0, 0))).toBe(true);
    // January 5, 2025 is a Sunday (day 0)
    expect(cronMatches(cron, new Date(2025, 0, 5, 0, 0))).toBe(false);
  });

  it("matches monthly schedule", () => {
    const cron = parseCronExpression("0 0 1 * *");
    expect(cronMatches(cron, new Date(2025, 2, 1, 0, 0))).toBe(true);
    expect(cronMatches(cron, new Date(2025, 2, 2, 0, 0))).toBe(false);
  });
});

// ── CronScheduler ─────────────────────────────────────────────────

describe("CronScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers jobs and reports running state", () => {
    const logger = createLogger("error", "test");
    const scheduler = createCronScheduler(logger);

    expect(scheduler.running).toBe(false);

    scheduler.register({
      name: "test-job",
      expression: "* * * * *",
      handler: async () => {},
    });

    scheduler.start();
    expect(scheduler.running).toBe(true);
  });

  it("fires a job when the cron expression matches", async () => {
    const logger = createLogger("error", "test");
    const scheduler = createCronScheduler(logger);
    const handler = vi.fn().mockResolvedValue(undefined);

    scheduler.register({
      name: "test-job",
      expression: "* * * * *",
      handler,
    });

    scheduler.start();

    // Advance past the first tick
    await vi.advanceTimersByTimeAsync(1100);

    expect(handler).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it("isolates errors between jobs", async () => {
    const logger = createLogger("error", "test");
    const scheduler = createCronScheduler(logger);

    const failingHandler = vi.fn().mockRejectedValue(new Error("boom"));
    const successHandler = vi.fn().mockResolvedValue(undefined);

    scheduler.register({
      name: "failing-job",
      expression: "* * * * *",
      handler: failingHandler,
    });

    scheduler.register({
      name: "success-job",
      expression: "* * * * *",
      handler: successHandler,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1100);

    expect(failingHandler).toHaveBeenCalled();
    expect(successHandler).toHaveBeenCalled();

    await scheduler.stop();
  });

  it("does not fire the same job twice in the same minute", async () => {
    const logger = createLogger("error", "test");
    const scheduler = createCronScheduler(logger);
    const handler = vi.fn().mockResolvedValue(undefined);

    scheduler.register({
      name: "test-job",
      expression: "* * * * *",
      handler,
    });

    scheduler.start();

    // Multiple ticks within the same minute
    await vi.advanceTimersByTimeAsync(5000);

    expect(handler).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it("stops cleanly", async () => {
    const logger = createLogger("error", "test");
    const scheduler = createCronScheduler(logger);

    scheduler.register({
      name: "test-job",
      expression: "* * * * *",
      handler: async () => {},
    });

    scheduler.start();
    expect(scheduler.running).toBe(true);

    await scheduler.stop();
    expect(scheduler.running).toBe(false);
  });
});
