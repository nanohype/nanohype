/**
 * Pipeline facade and CLI entry point for __PROJECT_NAME__.
 *
 * createPipeline(config) returns a pipeline runner that chains
 * ingest → transform → embed → index using the configured providers.
 *
 * CLI usage:
 *   tsx src/pipeline/index.ts <source-path>
 */

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { logger } from "./logger.js";
import { runPipeline } from "./orchestrator.js";
import { getSource } from "./ingest/index.js";
import { getStrategy } from "./transform/index.js";
import { getEmbeddingProvider } from "./embed/index.js";
import { getAdapter } from "./output/index.js";
import type { PipelineConfig, PipelineResult, ProgressEvent } from "./types.js";

// ── Config Schema ──────────────────────────────────────────────────

export const configSchema = z.object({
  sourcePath: z.string().min(1),
  sourceType: z.string().default("file"),
  chunkStrategy: z.string().default("__CHUNK_STRATEGY__"),
  chunkSize: z.number().int().positive().default(512),
  chunkOverlap: z.number().int().min(0).default(64),
  embeddingProvider: z.string().default("__EMBEDDING_PROVIDER__"),
  embeddingModel: z.string().default("text-embedding-3-small"),
  embeddingDimensions: z.number().int().positive().default(1536),
  embeddingBatchSize: z.number().int().positive().default(128),
  outputAdapter: z.string().default("json-file"),
  outputFile: z.string().default("./output/embeddings.jsonl"),
});

// ── Pipeline Factory ───────────────────────────────────────────────

export interface Pipeline {
  /** Run the pipeline on the configured source path. */
  run(sourcePath?: string): Promise<PipelineResult>;
}

export interface CreatePipelineOptions {
  /** Optional progress callback fired at stage transitions. */
  onProgress?: (event: ProgressEvent) => void;
}

/**
 * Create a pipeline instance from configuration.
 *
 * @param config   Pipeline configuration (validated against configSchema).
 * @param options  Optional callbacks and overrides.
 * @returns        A pipeline with a single `run()` method.
 */
export function createPipeline(
  config: PipelineConfig,
  options: CreatePipelineOptions = {},
): Pipeline {
  return {
    async run(sourcePath?: string): Promise<PipelineResult> {
      const effectiveConfig = sourcePath
        ? { ...config, sourcePath }
        : config;

      const source = getSource(effectiveConfig.sourceType);
      const strategy = getStrategy(effectiveConfig.chunkStrategy);
      const embedder = getEmbeddingProvider(
        effectiveConfig.embeddingProvider,
        effectiveConfig.embeddingModel,
        effectiveConfig.embeddingDimensions,
        effectiveConfig.embeddingBatchSize,
      );
      const adapter = getAdapter(effectiveConfig.outputAdapter);

      return runPipeline({
        source,
        strategy,
        embedder,
        adapter,
        config: effectiveConfig,
        onProgress: options.onProgress,
      });
    },
  };
}

// ── Config Loader ──────────────────────────────────────────────────

function loadConfigFromEnv(sourcePath: string): PipelineConfig {
  return configSchema.parse({
    sourcePath,
    sourceType: sourcePath.startsWith("http") ? "web" : "file",
    chunkStrategy: process.env.CHUNK_STRATEGY,
    chunkSize: process.env.CHUNK_SIZE ? Number(process.env.CHUNK_SIZE) : undefined,
    chunkOverlap: process.env.CHUNK_OVERLAP ? Number(process.env.CHUNK_OVERLAP) : undefined,
    embeddingProvider: process.env.EMBEDDING_PROVIDER,
    embeddingModel: process.env.EMBEDDING_MODEL,
    embeddingDimensions: process.env.EMBEDDING_DIMENSIONS
      ? Number(process.env.EMBEDDING_DIMENSIONS)
      : undefined,
    embeddingBatchSize: process.env.EMBEDDING_BATCH_SIZE
      ? Number(process.env.EMBEDDING_BATCH_SIZE)
      : undefined,
    outputAdapter: process.env.OUTPUT_ADAPTER,
    outputFile: process.env.OUTPUT_FILE,
  });
}

// ── CLI Entry Point ────────────────────────────────────────────────

async function main(): Promise<void> {
  validateBootstrap();

  const args = process.argv.slice(2);
  const sourcePath = args[0];

  if (!sourcePath) {
    console.error("Usage:");
    console.error("  tsx src/pipeline/index.ts <source-path>     Process files or URL");
    console.error("");
    console.error("Examples:");
    console.error("  tsx src/pipeline/index.ts ./docs");
    console.error("  tsx src/pipeline/index.ts https://example.com/page");
    process.exit(1);
  }

  // Load .env if present
  try {
    await import("dotenv/config");
  } catch {
    // dotenv is optional
  }

  const config = loadConfigFromEnv(sourcePath);

  logger.info("Starting pipeline", {
    source: sourcePath,
    chunkStrategy: config.chunkStrategy,
    embeddingProvider: config.embeddingProvider,
    outputAdapter: config.outputAdapter,
  });

  const pipeline = createPipeline(config, {
    onProgress: (event) => {
      logger.debug("Progress", {
        stage: event.stage,
        processed: event.processed,
        total: event.total,
        document: event.document,
      });
    },
  });

  const result = await pipeline.run();

  console.log("\nPipeline complete:");
  console.log(`  Documents ingested:  ${result.documentsIngested}`);
  console.log(`  Chunks created:      ${result.chunksCreated}`);
  console.log(`  Chunks embedded:     ${result.chunksEmbedded}`);
  console.log(`  Chunks indexed:      ${result.chunksIndexed}`);
  console.log(`  Duration:            ${result.durationMs}ms`);

  if (result.errors.length > 0) {
    console.log(`  Errors:              ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`    [${err.stage}] ${err.itemId}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});

// Re-export public API
export type { PipelineConfig, PipelineResult, ProgressEvent, Document, Chunk, EmbeddedChunk, PipelineError } from "./types.js";
export { runPipeline } from "./orchestrator.js";
export type { IngestSource } from "./ingest/types.js";
export type { ChunkStrategy, ChunkOptions } from "./transform/types.js";
export type { EmbeddingProvider } from "./embed/types.js";
export type { OutputAdapter, OutputAdapterConfig } from "./output/types.js";
