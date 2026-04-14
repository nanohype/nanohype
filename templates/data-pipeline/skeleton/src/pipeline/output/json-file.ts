/**
 * JSONL file output adapter.
 *
 * Writes embedded chunks as newline-delimited JSON (JSONL) to a file.
 * Each line contains a VectorDocument-compatible object with id,
 * content, embedding, and metadata fields. Creates parent directories
 * if they don't exist.
 *
 * Registers itself as the "json-file" output adapter on import.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { EmbeddedChunk } from "../types.js";
import type { OutputAdapter, OutputAdapterConfig } from "./types.js";
import { registerAdapter } from "./registry.js";
import { logger } from "../logger.js";

class JsonFileAdapter implements OutputAdapter {
  readonly name = "json-file";
  private filePath = "./output/embeddings.jsonl";
  private initialized = false;

  async init(config: OutputAdapterConfig): Promise<void> {
    if (typeof config.filePath === "string" && config.filePath) {
      this.filePath = config.filePath;
    }

    // Ensure output directory exists
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    this.initialized = true;
    logger.info("JSON file adapter initialized", { filePath: this.filePath });
  }

  async write(chunks: EmbeddedChunk[]): Promise<void> {
    if (!this.initialized) {
      throw new Error("JSON file adapter not initialized. Call init() first.");
    }

    const lines = chunks.map((chunk) =>
      JSON.stringify({
        id: chunk.id,
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
      }),
    );

    await appendFile(this.filePath, lines.join("\n") + "\n", "utf-8");
    logger.debug("Wrote chunks to JSONL", { count: chunks.length, filePath: this.filePath });
  }

  async close(): Promise<void> {
    logger.info("JSON file adapter closed", { filePath: this.filePath });
    this.initialized = false;
  }
}

registerAdapter("json-file", () => new JsonFileAdapter());
