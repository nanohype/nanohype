import pg from "pg";
import type { VectorDocument, SearchResult, VectorStoreConfig } from "../types.js";
import type { FilterExpression } from "../filters/types.js";
import type { VectorStoreProvider } from "./types.js";
import { registerProvider } from "./registry.js";
import { compileFilter, type SqlFilterResult } from "../filters/compiler.js";
import { withRetry } from "../helpers.js";

// -- pgvector Provider ---------------------------------------------------
//
// PostgreSQL with the pgvector extension. Creates a table with a vector
// column on init. Uses the `<=>` cosine distance operator for similarity
// search. Metadata is stored as JSONB and supports SQL-based filtering
// via the filter compiler.
//

interface PgVectorConfig extends VectorStoreConfig {
  /** PostgreSQL connection string. */
  connectionString?: string;
  /** Table name for storing vectors. Default: "embeddings". */
  tableName?: string;
  /** Vector dimensions. Default: 1536 (OpenAI ada-002). */
  dimensions?: number;
}

class PgVectorProvider implements VectorStoreProvider {
  readonly name = "pgvector";
  private pool: pg.Pool | null = null;
  private tableName = "embeddings";
  private dimensions = 1536;

  async init(config: PgVectorConfig): Promise<void> {
    const connectionString =
      config.connectionString || process.env.PGVECTOR_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error(
        "pgvector provider requires connectionString config or PGVECTOR_CONNECTION_STRING env var",
      );
    }

    this.tableName = (config.tableName as string) || process.env.PGVECTOR_TABLE_NAME || "embeddings";
    this.dimensions =
      (config.dimensions as number) || Number(process.env.PGVECTOR_DIMENSIONS) || 1536;

    this.pool = new pg.Pool({ connectionString });

    // Ensure pgvector extension and table exist
    await withRetry(async () => {
      const client = await this.pool!.connect();
      try {
        await client.query("CREATE EXTENSION IF NOT EXISTS vector");
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            embedding vector(${this.dimensions}),
            metadata JSONB DEFAULT '{}'::jsonb
          )
        `);
        // Create an index for faster cosine similarity search
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
          ON ${this.tableName}
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 100)
        `).catch(() => {
          // IVFFlat index requires at least some rows; skip if table is empty
        });
      } finally {
        client.release();
      }
    });
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (!this.pool) throw new Error("Provider not initialized");

    await withRetry(async () => {
      const client = await this.pool!.connect();
      try {
        for (const doc of documents) {
          const embeddingStr = `[${doc.embedding.join(",")}]`;
          await client.query(
            `INSERT INTO ${this.tableName} (id, content, embedding, metadata)
             VALUES ($1, $2, $3::vector, $4::jsonb)
             ON CONFLICT (id)
             DO UPDATE SET content = $2, embedding = $3::vector, metadata = $4::jsonb`,
            [doc.id, doc.content, embeddingStr, JSON.stringify(doc.metadata)],
          );
        }
      } finally {
        client.release();
      }
    });
  }

  async query(
    embedding: number[],
    topK: number,
    filter?: FilterExpression,
  ): Promise<SearchResult[]> {
    if (!this.pool) throw new Error("Provider not initialized");

    return withRetry(async () => {
      const embeddingStr = `[${embedding.join(",")}]`;
      // Base params: $1 = embedding vector, $2 = topK limit
      const queryParams: unknown[] = [embeddingStr, topK];

      let sql = `
        SELECT id, content, metadata,
               1 - (embedding <=> $1::vector) AS score
        FROM ${this.tableName}
      `;

      if (filter) {
        // Filter params are appended after the base params, so we need to
        // offset the $N placeholders by the number of base params.
        const compiled = compileFilter(filter, "sql") as SqlFilterResult;
        // Re-number placeholders: the compiler generates $1..$M, but we
        // need $3..$N because $1 and $2 are already taken.
        const offset = queryParams.length;
        const offsetSql = compiled.sql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`);
        sql += ` WHERE ${offsetSql}`;
        queryParams.push(...compiled.params);
      }

      sql += ` ORDER BY embedding <=> $1::vector LIMIT $2`;

      const result = await this.pool!.query(sql, queryParams);

      return result.rows.map((row) => ({
        id: row.id as string,
        content: row.content as string,
        score: parseFloat(row.score),
        metadata: row.metadata as Record<string, unknown>,
      }));
    });
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.pool) throw new Error("Provider not initialized");

    await withRetry(async () => {
      await this.pool!.query(
        `DELETE FROM ${this.tableName} WHERE id = ANY($1)`,
        [ids],
      );
    });
  }

  async count(): Promise<number> {
    if (!this.pool) throw new Error("Provider not initialized");

    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM ${this.tableName}`,
    );
    return result.rows[0].count;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

// Self-register
registerProvider("pgvector", () => new PgVectorProvider());
