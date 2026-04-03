// ── Scheduler Types ───────────────────────────────────────────────
//
// Internal types for the cron scheduler. CronField represents a
// parsed field from a 5-field cron expression. ScheduledEntry tracks
// registered jobs and their next fire time.
//

/** A single parsed cron field — either a set of allowed values or a wildcard. */
export interface CronField {
  /** If true, any value matches this field. */
  wildcard: boolean;

  /** Explicit set of allowed integer values for this field. */
  values: Set<number>;
}

/** Parsed representation of a full 5-field cron expression. */
export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

/** Internal entry tracking a registered cron job. */
export interface ScheduledEntry {
  /** Job name. */
  name: string;

  /** Parsed cron expression. */
  cron: ParsedCron;

  /** The handler function to execute. */
  handler: () => Promise<void>;

  /** Timestamp (epoch ms) of the last minute this job was fired. */
  lastFiredMinute: number;
}
