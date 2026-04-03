import OpenAI from "openai";
import { createCircuitBreaker } from "../circuit-breaker.js";
import { registerEmbeddingProvider } from "./registry.js";
import type { EmbeddingProvider } from "./types.js";

// ── OpenAI Embedding Provider ──────────────────────────────────────
//
// Uses the text-embedding-3-small model (1536 dimensions) via the
// OpenAI SDK. Wraps API calls in a circuit breaker to handle
// transient failures gracefully. Reads OPENAI_API_KEY from the
// environment automatically via the SDK.
//

const DIMENSIONS = 1536;
const MODEL = "text-embedding-3-small";

const breaker = createCircuitBreaker({
  failureThreshold: 3,
  windowMs: 60_000,
  resetTimeoutMs: 30_000,
});

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI();
  }
  return client;
}

const openaiProvider: EmbeddingProvider = {
  name: "openai",
  dimensions: DIMENSIONS,

  async embed(text: string): Promise<number[]> {
    return breaker.execute(async () => {
      const response = await getClient().embeddings.create({
        model: MODEL,
        input: text,
      });
      return response.data[0].embedding;
    });
  },

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    return breaker.execute(async () => {
      const response = await getClient().embeddings.create({
        model: MODEL,
        input: texts,
      });
      return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
    });
  },
};

// Self-register
registerEmbeddingProvider(openaiProvider);
