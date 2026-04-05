import type { Command } from "commander";
import { ingest } from "../../operations/ingest.js";

export function registerIngestCommand(program: Command): void {
  program
    .command("ingest <tenant-id> <ref>")
    .description("Ingest a source reference into the wiki")
    .action(async (tenantId: string, ref: string) => {
      try {
        const result = await ingest(tenantId, ref);

        if (result.skipped) {
          console.log(`Skipped: source "${ref}" produced no content.`);
          return;
        }

        console.log(`Source: ${result.sourceId}`);

        if (result.pagesCreated.length > 0) {
          console.log("\nCreated:");
          for (const p of result.pagesCreated) {
            console.log(`  + ${p}`);
          }
        }

        if (result.pagesUpdated.length > 0) {
          console.log("\nUpdated:");
          for (const p of result.pagesUpdated) {
            console.log(`  ~ ${p}`);
          }
        }

        if (result.contradictions.length > 0) {
          console.log("\nContradictions:");
          for (const c of result.contradictions) {
            console.log(`  ! ${c.pageA} <-> ${c.pageB}: ${c.claim}`);
          }
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
