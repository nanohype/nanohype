/**
 * Pipeline orchestrator.
 *
 * Chains the four pipeline stages in sequence:
 *   ingest → transform → embed → index
 *
 * Each stage operates on the output of the previous one. Documents
 * that fail at any stage are captured in the error list and skipped —
 * the pipeline continues processing remaining items. Progress
 * callbacks fire at each stage transition and per-document boundary.
 */

import type {
  PipelineConfig,
  Document,
  Chunk,
  EmbeddedChunk,
  PipelineResult,
  PipelineError,
  ProgressEvent,
} from "./types.js";
import type { IngestSource } from "./ingest/types.js";
import type { ChunkStrategy } from "./transform/types.js";
import type { EmbeddingProvider } from "./embed/types.js";
import type { OutputAdapter } from "./output/types.js";
import { logger } from "./logger.js";
import { pipelineDocumentsProcessed, pipelineChunksCreated, pipelineDuration } from "./metrics.js";

export interface OrchestratorOptions {
  /** Ingest source for loading documents. */
  source: IngestSource;
  /** Chunking strategy for splitting documents. */
  strategy: ChunkStrategy;
  /** Embedding provider for generating vectors. */
  embedder: EmbeddingProvider;
  /** Output adapter for writing results. */
  adapter: OutputAdapter;
  /** Pipeline configuration. */
  config: PipelineConfig;
  /** Optional progress callback. */
  onProgress?: (event: ProgressEvent) => void;
}

/**
 * Run the full pipeline: ingest → transform → embed → index.
 *
 * Per-document error handling: if any document fails at any stage,
 * the error is recorded and the pipeline continues with the remaining
 * documents. The PipelineResult includes all errors encountered.
 */
export async function runPipeline(opts: OrchestratorOptions): Promise<PipelineResult> {
  const { source, strategy, embedder, adapter, config, onProgress } = opts;
  const errors: PipelineError[] = [];
  const startTime = Date.now();

  const progress = (event: ProgressEvent) => {
    if (onProgress) onProgress(event);
  };

  // ── Stage 1: Ingest ──────────────────────────────────────────────
  logger.info("Stage 1: Ingest", { source: source.name, location: config.sourcePath });
  progress({ stage: "ingest", processed: 0, total: 0 });

  let documents: Document[] = [];
  try {
    documents = await source.load(config.sourcePath);
  } catch (err) {
    errors.push({
      stage: "ingest",
      itemId: config.sourcePath,
      message: String(err),
    });
    logger.error("Ingest failed completely", { error: String(err) });
  }

  progress({ stage: "ingest", processed: documents.length, total: documents.length });
  logger.info("Ingest complete", { documents: documents.length });
  pipelineDocumentsProcessed.add(documents.length, { status: "loaded" });

  // ── Stage 2: Transform ───────────────────────────────────────────
  logger.info("Stage 2: Transform", { strategy: strategy.name });
  const allChunks: Chunk[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    progress({
      stage: "transform",
      processed: i,
      total: documents.length,
      document: doc.id,
    });

    try {
      const chunks = strategy.chunk(doc, {
        chunkSize: config.chunkSize,
        overlap: config.chunkOverlap,
      });
      allChunks.push(...chunks);
    } catch (err) {
      errors.push({
        stage: "transform",
        itemId: doc.id,
        message: String(err),
      });
      logger.warn("Transform failed for document", { docId: doc.id, error: String(err) });
    }
  }

  progress({ stage: "transform", processed: documents.length, total: documents.length });
  logger.info("Transform complete", { chunks: allChunks.length });
  pipelineChunksCreated.add(allChunks.length);

  // ── Stage 3: Embed ───────────────────────────────────────────────
  logger.info("Stage 3: Embed", { provider: embedder.name, chunks: allChunks.length });
  const embeddedChunks: EmbeddedChunk[] = [];

  // Process in batches to avoid overwhelming the embedding API
  const batchSize = config.embeddingBatchSize;
  const totalBatches = Math.ceil(allChunks.length / batchSize);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batch = allChunks.slice(batchStart, batchStart + batchSize);

    progress({
      stage: "embed",
      processed: batchStart,
      total: allChunks.length,
    });

    try {
      const texts = batch.map((c) => c.content);
      const embeddings = await embedder.embedBatch(texts);

      for (let i = 0; i < batch.length; i++) {
        embeddedChunks.push({
          id: batch[i].id,
          content: batch[i].content,
          embedding: embeddings[i],
          metadata: {
            ...batch[i].metadata,
            chunkIndex: batch[i].chunkIndex,
            chunkCount: batch[i].chunkCount,
            embeddingProvider: embedder.name,
            embeddingDimensions: embedder.dimensions,
          },
        });
      }
    } catch (err) {
      // Record errors for all chunks in the failed batch
      for (const chunk of batch) {
        errors.push({
          stage: "embed",
          itemId: chunk.id,
          message: String(err),
        });
      }
      logger.warn("Embed failed for batch", {
        batchIdx,
        batchSize: batch.length,
        error: String(err),
      });
    }
  }

  progress({ stage: "embed", processed: allChunks.length, total: allChunks.length });
  logger.info("Embed complete", { embedded: embeddedChunks.length });

  // ── Stage 4: Index (Output) ──────────────────────────────────────
  logger.info("Stage 4: Index", { adapter: adapter.name, chunks: embeddedChunks.length });
  let chunksIndexed = 0;

  try {
    await adapter.init({
      filePath: config.outputFile,
    });

    // Write in batches
    for (let i = 0; i < embeddedChunks.length; i += batchSize) {
      const batch = embeddedChunks.slice(i, i + batchSize);

      progress({
        stage: "index",
        processed: i,
        total: embeddedChunks.length,
      });

      try {
        await adapter.write(batch);
        chunksIndexed += batch.length;
      } catch (err) {
        for (const chunk of batch) {
          errors.push({
            stage: "index",
            itemId: chunk.id,
            message: String(err),
          });
        }
        logger.warn("Index write failed for batch", { error: String(err) });
      }
    }

    await adapter.close();
  } catch (err) {
    errors.push({
      stage: "index",
      itemId: "adapter",
      message: String(err),
    });
    logger.error("Index adapter error", { error: String(err) });
  }

  progress({ stage: "index", processed: embeddedChunks.length, total: embeddedChunks.length });

  const durationMs = Date.now() - startTime;
  pipelineDuration.record(durationMs);

  logger.info("Pipeline complete", {
    documentsIngested: documents.length,
    chunksCreated: allChunks.length,
    chunksEmbedded: embeddedChunks.length,
    chunksIndexed,
    errors: errors.length,
    durationMs,
  });

  return {
    documentsIngested: documents.length,
    chunksCreated: allChunks.length,
    chunksEmbedded: embeddedChunks.length,
    chunksIndexed,
    errors,
    durationMs,
  };
}
