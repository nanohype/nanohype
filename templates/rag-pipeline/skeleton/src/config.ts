/**
 * Configuration management using Zod schema validation.
 *
 * Loads all pipeline configuration from environment variables with sensible
 * defaults. Each component (chunking, embedding, vector store, generation,
 * retrieval) has its own settings group, and the top-level config composes
 * them into a single validated configuration object.
 */

import "dotenv/config";
import { z } from "zod";

const chunkingSchema = z.object({
  strategy: z.string().default("__CHUNK_STRATEGY__"),
  size: z.coerce.number().int().positive().default(512),
  overlap: z.coerce.number().int().nonnegative().default(64),
});

const embeddingSchema = z.object({
  provider: z.string().default("__EMBEDDING_PROVIDER__"),
  model: z.string().default("text-embedding-3-small"),
  dimensions: z.coerce.number().int().positive().default(1536),
  batchSize: z.coerce.number().int().positive().default(128),
});

const vectorstoreSchema = z.object({
  backend: z.string().default("__VECTOR_STORE__"),
  collectionName: z.string().default("documents"),
  pgConnectionString: z.string().default("postgresql://localhost:5432/__PROJECT_NAME__"),
  chromaPersistDir: z.string().default("./chroma_data"),
  qdrantUrl: z.string().default("http://localhost:6333"),
  qdrantApiKey: z.string().default(""),
  pineconeApiKey: z.string().default(""),
  pineconeIndexName: z.string().default("__PROJECT_NAME__"),
});

const generationSchema = z.object({
  provider: z.string().default("__LLM_PROVIDER__"),
  anthropicApiKey: z.string().default(""),
  openaiApiKey: z.string().default(""),
  model: z.string().default("claude-sonnet-4-20250514"),
  temperature: z.coerce.number().min(0).max(2).default(0.1),
  maxTokens: z.coerce.number().int().positive().default(1024),
});

const retrievalSchema = z.object({
  topK: z.coerce.number().int().positive().default(5),
  scoreThreshold: z.coerce.number().min(0).max(1).default(0.0),
});

const configSchema = z.object({
  chunking: chunkingSchema,
  embedding: embeddingSchema,
  vectorstore: vectorstoreSchema,
  generation: generationSchema,
  retrieval: retrievalSchema,
  docsDir: z.string().default("./docs"),
});

export type ChunkingConfig = z.infer<typeof chunkingSchema>;
export type EmbeddingConfig = z.infer<typeof embeddingSchema>;
export type VectorStoreConfig = z.infer<typeof vectorstoreSchema>;
export type GenerationConfig = z.infer<typeof generationSchema>;
export type RetrievalConfig = z.infer<typeof retrievalSchema>;
export type Config = z.infer<typeof configSchema>;

/**
 * Load configuration from environment variables.
 *
 * Environment variable mapping uses prefixed names:
 * - CHUNK_STRATEGY, CHUNK_SIZE, CHUNK_OVERLAP
 * - EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_BATCH_SIZE
 * - VECTORSTORE_BACKEND, VECTORSTORE_COLLECTION_NAME, etc.
 * - LLM_PROVIDER, LLM_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS
 * - RETRIEVAL_TOP_K, RETRIEVAL_SCORE_THRESHOLD
 * - DOCS_DIR
 */
export function loadConfig(): Config {
  const env = process.env;

  return configSchema.parse({
    chunking: {
      strategy: env.CHUNK_STRATEGY,
      size: env.CHUNK_SIZE,
      overlap: env.CHUNK_OVERLAP,
    },
    embedding: {
      provider: env.EMBEDDING_PROVIDER,
      model: env.EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS,
      batchSize: env.EMBEDDING_BATCH_SIZE,
    },
    vectorstore: {
      backend: env.VECTORSTORE_BACKEND,
      collectionName: env.VECTORSTORE_COLLECTION_NAME,
      pgConnectionString: env.VECTORSTORE_PG_CONNECTION_STRING,
      chromaPersistDir: env.VECTORSTORE_CHROMA_PERSIST_DIR,
      qdrantUrl: env.VECTORSTORE_QDRANT_URL,
      qdrantApiKey: env.VECTORSTORE_QDRANT_API_KEY,
      pineconeApiKey: env.VECTORSTORE_PINECONE_API_KEY,
      pineconeIndexName: env.VECTORSTORE_PINECONE_INDEX_NAME,
    },
    generation: {
      provider: env.LLM_PROVIDER,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      openaiApiKey: env.OPENAI_API_KEY,
      model: env.LLM_MODEL,
      temperature: env.LLM_TEMPERATURE,
      maxTokens: env.LLM_MAX_TOKENS,
    },
    retrieval: {
      topK: env.RETRIEVAL_TOP_K,
      scoreThreshold: env.RETRIEVAL_SCORE_THRESHOLD,
    },
    docsDir: env.DOCS_DIR,
  });
}
