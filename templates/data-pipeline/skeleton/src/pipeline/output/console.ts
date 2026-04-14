/**
 * Console output adapter.
 *
 * Pretty-prints embedded chunks to stdout for development and
 * debugging. Shows chunk ID, content preview, embedding dimensions,
 * and metadata. Does not persist data.
 *
 * Registers itself as the "console" output adapter on import.
 */

import type { EmbeddedChunk } from "../types.js";
import type { OutputAdapter, OutputAdapterConfig } from "./types.js";
import { registerAdapter } from "./registry.js";

const PREVIEW_LENGTH = 120;

class ConsoleAdapter implements OutputAdapter {
  readonly name = "console";

  async init(_config: OutputAdapterConfig): Promise<void> {
    console.log("\n--- Pipeline Output (console adapter) ---\n");
  }

  async write(chunks: EmbeddedChunk[]): Promise<void> {
    for (const chunk of chunks) {
      const preview = chunk.content.length > PREVIEW_LENGTH
        ? chunk.content.slice(0, PREVIEW_LENGTH) + "..."
        : chunk.content;

      console.log(`[${chunk.id}]`);
      console.log(`  Content: ${preview}`);
      console.log(`  Embedding: [${chunk.embedding.length} dims]`);
      console.log(`  Metadata: ${JSON.stringify(chunk.metadata)}`);
      console.log();
    }
  }

  async close(): Promise<void> {
    console.log("--- End of output ---\n");
  }
}

registerAdapter("console", () => new ConsoleAdapter());
