/**
 * Document ingestion pipeline.
 *
 * Orchestrates the full ingestion flow: load files from a directory,
 * split into chunks, generate embeddings, and store in the configured
 * vector database.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

import type { Config } from "./config.js";
import { createChunker } from "./chunking.js";
import { getEmbeddingProvider, getVectorStoreProvider } from "./providers/index.js";
import type { VectorDocument } from "./providers/types.js";
import { logger } from "./logger.js";

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);

interface FileContent {
  path: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Load a single file and return its content.
 * Returns null for unsupported or unreadable files.
 */
async function loadFile(filePath: string): Promise<FileContent | null> {
  const ext = extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    logger.debug("Skipping unsupported file type", { path: filePath });
    return null;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    if (!content.trim()) {
      logger.debug("Skipping empty file", { path: filePath });
      return null;
    }

    return {
      path: filePath,
      content,
      metadata: {
        source: filePath,
        filename: filePath.split("/").pop() ?? filePath,
        extension: ext,
      },
    };
  } catch (err) {
    logger.warn("Failed to read file", { path: filePath, error: String(err) });
    return null;
  }
}

/**
 * Recursively load all supported files from a directory.
 */
async function loadDirectory(docsDir: string): Promise<FileContent[]> {
  const files: FileContent[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir);
    const sorted = entries.sort();

    for (const entry of sorted) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        await walk(fullPath);
      } else if (stats.isFile()) {
        const content = await loadFile(fullPath);
        if (content) files.push(content);
      }
    }
  }

  await walk(docsDir);
  logger.info("Loaded files from directory", { dir: docsDir, count: files.length });
  return files;
}

/**
 * Generate a stable content hash for deduplication.
 */
function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}

export interface IngestStats {
  filesLoaded: number;
  chunksCreated: number;
  chunksStored: number;
}

/**
 * Run the full ingestion pipeline.
 *
 * 1. Load documents from the configured directory
 * 2. Chunk each document using the configured strategy
 * 3. Generate embeddings for all chunks
 * 4. Store chunks with embeddings in the vector store
 */
export async function ingestDirectory(config: Config): Promise<IngestStats> {
  const files = await loadDirectory(config.docsDir);
  if (!files.length) {
    logger.warn("No documents found", { dir: config.docsDir });
    return { filesLoaded: 0, chunksCreated: 0, chunksStored: 0 };
  }

  // Chunk
  const chunker = createChunker(config.chunking);
  const allDocs: VectorDocument[] = [];

  for (const file of files) {
    const chunks = chunker.chunk(file.content, file.metadata);
    for (let i = 0; i < chunks.length; i++) {
      allDocs.push({
        id: `${contentHash(file.path)}_${i}`,
        content: chunks[i].content,
        embedding: [],
        metadata: {
          ...chunks[i].metadata,
          chunkIndex: i,
          chunkCount: chunks.length,
        },
      });
    }
  }

  logger.info("Chunking complete", {
    files: files.length,
    chunks: allDocs.length,
  });

  // Embed
  const embedder = getEmbeddingProvider(
    config.embedding.provider,
    config.embedding.model,
    config.embedding.dimensions,
    config.embedding.batchSize,
  );
  const texts = allDocs.map((doc) => doc.content);
  const embeddings = await embedder.embedBatch(texts);

  for (let i = 0; i < allDocs.length; i++) {
    allDocs[i].embedding = embeddings[i];
  }

  // Store
  const store = getVectorStoreProvider(
    config.vectorstore.backend,
    config.vectorstore,
    config.embedding.dimensions,
  );
  await store.init();
  await store.addDocuments(allDocs);

  logger.info("Ingestion complete", { chunksStored: allDocs.length });

  return {
    filesLoaded: files.length,
    chunksCreated: allDocs.length,
    chunksStored: allDocs.length,
  };
}
