/**
 * CLI entry point for the __PROJECT_NAME__ multimodal pipeline.
 *
 * Commands:
 *   process <file>   Detect modality, process, and analyze a file
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { processFile } from "./pipeline.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  validateBootstrap();

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command !== "process" || !args[1]) {
    console.error("Usage:");
    console.error("  tsx src/index.ts process <file>          Process a single file");
    console.error("  tsx src/index.ts process <directory>     Process all files in a directory");
    process.exit(1);
  }

  const config = loadConfig();
  const target = args[1];
  const targetStat = await stat(target);

  if (targetStat.isFile()) {
    logger.info("Processing single file", { file: target });
    const result = await processFile(target, config);

    console.log("\nResult:");
    console.log(JSON.stringify(result, null, 2));
  } else if (targetStat.isDirectory()) {
    logger.info("Processing directory", { dir: target });
    const files = await readdir(target);
    const results = [];

    for (const file of files) {
      const filePath = join(target, file);
      const fileStat = await stat(filePath);

      if (!fileStat.isFile()) continue;

      try {
        logger.info("Processing file", { file: filePath });
        const result = await processFile(filePath, config);
        results.push(result);
      } catch (err) {
        logger.error("Failed to process file", {
          file: filePath,
          error: String(err),
        });
      }
    }

    console.log("\nResults:");
    console.log(JSON.stringify(results, null, 2));
    console.log(`\nProcessed ${results.length} of ${files.length} files`);
  } else {
    console.error(`Error: "${target}" is not a file or directory`);
    process.exit(1);
  }
}

// ── Graceful Shutdown ────────────────────────────────────────────────

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down...`);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});
