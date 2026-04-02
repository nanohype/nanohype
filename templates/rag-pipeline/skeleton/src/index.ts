/**
 * CLI entry point for the __PROJECT_NAME__ RAG pipeline.
 *
 * Commands:
 *   ingest <dir>       Load, chunk, embed, and store documents
 *   query <question>   Retrieve context and generate an answer
 */

import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { ingestDirectory } from "./ingest.js";
import { query } from "./generation.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  validateBootstrap();

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || !["ingest", "query"].includes(command)) {
    console.error("Usage:");
    console.error("  tsx src/index.ts ingest [dir]      Ingest documents from directory");
    console.error("  tsx src/index.ts query <question>   Query the RAG pipeline");
    process.exit(1);
  }

  const config = loadConfig();

  if (command === "ingest") {
    const dir = args[1] ?? config.docsDir;
    const configWithDir = { ...config, docsDir: dir };

    logger.info("Starting ingestion", { dir });
    const stats = await ingestDirectory(configWithDir);

    console.log("\nIngestion complete:");
    console.log(`  Files loaded:   ${stats.filesLoaded}`);
    console.log(`  Chunks created: ${stats.chunksCreated}`);
    console.log(`  Chunks stored:  ${stats.chunksStored}`);
  }

  if (command === "query") {
    const question = args.slice(1).join(" ");
    if (!question) {
      console.error("Error: Please provide a question.");
      console.error("  tsx src/index.ts query <question>");
      process.exit(1);
    }

    logger.info("Processing query", { question });
    const result = await query(question, config);

    console.log("\nAnswer:");
    console.log(result.answer);

    if (result.sources.length) {
      console.log("\nSources:");
      for (const source of result.sources) {
        console.log(`  - ${source.source} (score: ${source.score.toFixed(2)})`);
      }
    }

    if (Object.keys(result.usage).length) {
      console.log(`\nModel: ${result.model}`);
      console.log(`Tokens: ${JSON.stringify(result.usage)}`);
    }
  }
}

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});
