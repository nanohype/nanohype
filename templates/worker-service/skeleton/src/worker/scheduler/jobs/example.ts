import type { CronJobDefinition } from "../../types.js";

// ── Example Cron Job: Cleanup Stale Data ──────────────────────────
//
// Runs every hour to clean up stale or expired data. Replace this
// with your own scheduled maintenance tasks — database vacuuming,
// cache invalidation, report generation, etc.
//

export const cleanupStaleData: CronJobDefinition = {
  name: "cleanup-stale-data",
  expression: "0 * * * *",
  description: "Example job — computes a 30-day cutoff and exits without deleting anything",

  async handler(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // A real handler would act on the cutoff, e.g.:
    //
    //   const deleted = await db
    //     .delete(records)
    //     .where(lt(records.createdAt, cutoff));
    //
    //   logger.info(`Cleaned up ${deleted.rowCount} stale records`);

    void cutoff;
  },
};
