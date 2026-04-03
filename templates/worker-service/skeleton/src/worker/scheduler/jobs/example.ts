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
  description: "Remove stale data older than 30 days",

  async handler(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // TODO: Replace with actual cleanup logic
    //
    //   const deleted = await db
    //     .delete(records)
    //     .where(lt(records.createdAt, cutoff));
    //
    //   logger.info(`Cleaned up ${deleted.rowCount} stale records`);

    void cutoff;
  },
};
