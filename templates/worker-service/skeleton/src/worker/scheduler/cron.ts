import type { CronJobDefinition } from "../types.js";
import type { Logger } from "../logger.js";
import type { CronField, ParsedCron, ScheduledEntry } from "./types.js";
import { workerCronTotal } from "../metrics.js";

// ── Cron Scheduler ────────────────────────────────────────────────
//
// Lightweight cron scheduler that checks every second which jobs are
// due based on standard 5-field cron expressions. No external cron
// library — uses a simple setTimeout tick loop with a built-in
// expression parser.
//
// Fields: minute (0-59), hour (0-23), day-of-month (1-31),
// month (1-12), day-of-week (0-6, 0=Sunday).
//
// Supports: wildcards (*), lists (1,3,5), ranges (1-5), and
// step values (*/5, 1-10/2).
//

/** Parse a single cron field into a CronField. */
export function parseField(field: string, min: number, max: number): CronField {
  if (field === "*") {
    return { wildcard: true, values: new Set() };
  }

  const values = new Set<number>();

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2]!, 10) : 1;
    const range = stepMatch ? stepMatch[1]! : part;

    if (range === "*") {
      for (let i = min; i <= max; i += step) {
        values.add(i);
      }
    } else if (range.includes("-")) {
      const [startStr, endStr] = range.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);

      if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
        throw new Error(`Invalid cron range: ${part} (allowed ${min}-${max})`);
      }

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else {
      const val = parseInt(range, 10);
      if (isNaN(val) || val < min || val > max) {
        throw new Error(`Invalid cron value: ${range} (allowed ${min}-${max})`);
      }
      values.add(val);
    }
  }

  return { wildcard: false, values };
}

/** Parse a standard 5-field cron expression into a ParsedCron. */
export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error(
      `Invalid cron expression: expected 5 fields, got ${fields.length} ("${expression}")`
    );
  }

  return {
    minute: parseField(fields[0]!, 0, 59),
    hour: parseField(fields[1]!, 0, 23),
    dayOfMonth: parseField(fields[2]!, 1, 31),
    month: parseField(fields[3]!, 1, 12),
    dayOfWeek: parseField(fields[4]!, 0, 6),
  };
}

/** Check whether a CronField matches a given value. */
function fieldMatches(field: CronField, value: number): boolean {
  return field.wildcard || field.values.has(value);
}

/** Check whether a ParsedCron matches the given date. */
export function cronMatches(cron: ParsedCron, date: Date): boolean {
  return (
    fieldMatches(cron.minute, date.getMinutes()) &&
    fieldMatches(cron.hour, date.getHours()) &&
    fieldMatches(cron.dayOfMonth, date.getDate()) &&
    fieldMatches(cron.month, date.getMonth() + 1) &&
    fieldMatches(cron.dayOfWeek, date.getDay())
  );
}

/** Truncate a Date to the start of its minute (zero out seconds and ms). */
function minuteEpoch(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes()
  ).getTime();
}

export interface CronScheduler {
  /** Register a cron job. */
  register(job: CronJobDefinition): void;

  /** Start the tick loop. */
  start(): void;

  /** Stop the tick loop and wait for in-flight jobs to finish. */
  stop(): Promise<void>;

  /** Whether the scheduler is currently running. */
  readonly running: boolean;
}

/**
 * Create a CronScheduler instance. The scheduler uses setTimeout to
 * tick every second, checking registered jobs against the current time.
 * Each job fires at most once per calendar minute.
 */
export function createCronScheduler(logger: Logger): CronScheduler {
  const entries: ScheduledEntry[] = [];
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  let isRunning = false;
  let inFlightCount = 0;

  function register(job: CronJobDefinition): void {
    const cron = parseCronExpression(job.expression);
    entries.push({
      name: job.name,
      cron,
      handler: job.handler,
      lastFiredMinute: 0,
    });
    logger.info(`Registered cron job: ${job.name}`, {
      expression: job.expression,
      description: job.description,
    });
  }

  function tick(): void {
    if (!isRunning) return;

    const now = new Date();
    const currentMinute = minuteEpoch(now);

    for (const entry of entries) {
      if (entry.lastFiredMinute === currentMinute) continue;

      if (cronMatches(entry.cron, now)) {
        entry.lastFiredMinute = currentMinute;
        inFlightCount++;

        logger.debug(`Firing cron job: ${entry.name}`);

        entry
          .handler()
          .then(() => {
            workerCronTotal.add(1, { job_name: entry.name, status: "success" });
            logger.debug(`Cron job completed: ${entry.name}`);
          })
          .catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err));
            workerCronTotal.add(1, { job_name: entry.name, status: "error" });
            logger.error(`Cron job failed: ${entry.name}`, { error: error.message });
          })
          .finally(() => {
            inFlightCount--;
          });
      }
    }

    tickTimer = setTimeout(tick, 1000);
  }

  function start(): void {
    if (isRunning) return;
    isRunning = true;
    logger.info(`Cron scheduler started with ${entries.length} job(s)`);
    tickTimer = setTimeout(tick, 1000);
  }

  async function stop(): Promise<void> {
    isRunning = false;

    if (tickTimer !== null) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }

    // Wait for in-flight cron jobs to finish (10s deadline)
    const deadline = Date.now() + 10_000;
    while (inFlightCount > 0 && Date.now() < deadline) {
      await sleep(100);
    }

    if (inFlightCount > 0) {
      logger.warn(`Cron scheduler stopped with ${inFlightCount} in-flight job(s)`);
    } else {
      logger.info("Cron scheduler stopped");
    }
  }

  return {
    register,
    start,
    stop,
    get running() {
      return isRunning;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
