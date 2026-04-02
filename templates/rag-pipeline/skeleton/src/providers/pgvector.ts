/**
 * PostgreSQL + pgvector vector store provider.
 *
 * Registers itself as the "pgvector" vector store provider on import.
 */

import pg from "pg";
import type { VectorStoreProvider, VectorDocument, SearchResult } from "./types.js";
import type { VectorStoreConfig } from "../config.js";
import { registerVectorStoreProvider } from "./registry.js";
import { logger } from "../logger.js";

class PgVectorStore implements VectorStoreProvider {
  private readonly pool: pg.Pool;
  private readonly table: string;
  private readonly dimensions: number;

  constructor(config: VectorStoreConfig, dimensions: number) {
    this.pool = new pg.Pool({ connectionString: config.pgConnectionString });
    this.table = config.collectionName;
    this.dimensions = dimensions;
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.escapeId(this.table)} (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          metadata JSONB DEFAULT '{}'::jsonb,
          embedding vector(${this.dimensions})
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.table}_embedding
        ON ${this.escapeId(this.table)}
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
      logger.info("pgvector table initialized", { table: this.table });
    } finally {
      client.release();
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!documents.length) return;

    const client = await this.pool.connect();
    try {
      for (const doc of documents) {
        await client.query(
          `INSERT INTO ${this.escapeId(this.table)} (id, content, metadata, embedding)
           VALUES ($1, $2, $3::jsonb, $4::vector)
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             metadata = EXCLUDED.metadata,
             embedding = EXCLUDED.embedding`,
          [doc.id, doc.content, JSON.stringify(doc.metadata), `[${doc.embedding.join(",")}]`],
        );
      }
    } finally {
      client.release();
    }
  }

  async search(
    queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const params: unknown[] = [vectorStr];
    const whereClauses: string[] = [];

    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        this.validateMetadataKey(key);
        params.push(value);
        whereClauses.push(`metadata->>'${key}' = $${params.length}`);
      }
    }

    params.push(vectorStr);
    params.push(topK);

    let query = `
      SELECT id, content, metadata,
        1 - (embedding <=> $1::vector) AS score
      FROM ${this.escapeId(this.table)}
    `;

    if (whereClauses.length) {
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    query += ` ORDER BY embedding <=> $${params.length - 1}::vector LIMIT $${params.length}`;

    const result = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      id: row.id as string,
      content: row.content as string,
      score: parseFloat(row.score as string),
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    await this.pool.query(
      `DELETE FROM ${this.escapeId(this.table)} WHERE id = ANY($1)`,
      [ids],
    );
  }

  private escapeId(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  private validateMetadataKey(key: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid metadata filter key: "${key}"`);
    }
  }
}

registerVectorStoreProvider(
  "pgvector",
  (config?: unknown, dimensions?: unknown) =>
    new PgVectorStore(config as VectorStoreConfig, dimensions as number),
);
