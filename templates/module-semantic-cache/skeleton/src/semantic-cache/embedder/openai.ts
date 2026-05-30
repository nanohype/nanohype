import OpenAI from "openai";
import { createCircuitBreaker } from "../circuit-breaker.js";
import { registerEmbeddingProvider } from "./registry.js";
import type { EmbeddingProvider } from "./types.js";

// ── OpenAI Embedding Provider ──────────────────────────────────────
//
// Uses the text-embedding-3-small model (1536 dimensions) via the
// OpenAI SDK. Each factory call builds its own circuit breaker and SDK
// client, so providers don't share failure state across cache
// instances. Every request carries an explicit timeout and bounded
// retries. Reads OPENAI_API_KEY from the environment via the SDK.
//

const DIMENSIONS = 1536;
const MODEL = "text-embedding-3-small";

const REQUEST_TIMEOUT_MS = Number(process.env.EMBED_REQUEST_TIMEOUT_MS ?? 30_000);

function createOpenaiEmbedder(): EmbeddingProvider {
  const breaker = createCircuitBreaker({
    failureThreshold: 3,
    windowMs: 60_000,
    resetTimeoutMs: 30_000,
  });

  const client = new OpenAI({
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 2,
  });

  return {
    name: "openai",
    dimensions: DIMENSIONS,

    async embed(text: string): Promise<number[]> {
      return breaker.execute(async () => {
        const response = await client.embeddings.create({
          model: MODEL,
          input: text,
        });
        return response.data[0].embedding;
      });
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      return breaker.execute(async () => {
        const response = await client.embeddings.create({
          model: MODEL,
          input: texts,
        });
        return response.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
      });
    },
  };
}

// Self-register a factory — each createSemanticCache() gets a fresh client
// and circuit breaker.
registerEmbeddingProvider("openai", createOpenaiEmbedder);
