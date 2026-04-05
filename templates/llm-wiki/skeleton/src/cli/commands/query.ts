import type { Command } from "commander";
import { query } from "../../operations/query.js";

export function registerQueryCommand(program: Command): void {
  program
    .command("query <tenant-id> <question>")
    .description("Query the wiki with a natural language question")
    .option("--discover", "Enable file discovery for structural gaps", false)
    .action(async (tenantId: string, question: string, opts: { discover: boolean }) => {
      try {
        const result = await query(tenantId, question, {
          fileDiscovery: opts.discover,
        });

        console.log(result.answer);

        if (result.citations.length > 0) {
          console.log("\nSources:");
          for (const c of result.citations) {
            console.log(`  [${c.page}] ${c.excerpt}`);
          }
        }

        if (result.discoveryPage) {
          console.log(`\nDiscovery page created: ${result.discoveryPage}`);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
