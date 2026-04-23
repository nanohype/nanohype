# module-database-ts

Composable database connection and query layer built on Drizzle ORM with pluggable drivers.

## What you get

- **Database client** (`src/db/client.ts`): singleton connection manager with `createDatabase(config)` for explicit setup and `getDb()` for lazy initialization from environment variables.
- **Driver registry** (`src/db/drivers/registry.ts`): self-registering driver pattern — each driver imports the registry and registers itself at module load time.
- **PostgreSQL driver** (`src/db/drivers/postgres.ts`): uses `pg` (node-postgres) with connection pooling via `pg.Pool`.
- **SQLite driver** (`src/db/drivers/sqlite.ts`): uses `better-sqlite3` with WAL mode and foreign keys enabled by default.
- **Turso driver** (`src/db/drivers/turso.ts`): uses `@libsql/client` for Turso edge databases, local SQLite files, and embedded replicas.
- **Schema definitions** (`src/db/schema.ts`): example Drizzle schema with a `users` table using type-safe column builders.
- **Migration runner** (`src/db/migrate.ts`): applies pending migrations from the `drizzle/` directory using the active driver's migrator.
- **Drizzle Kit config** (`drizzle.config.ts`): auto-detects dialect from `DB_DRIVER` environment variable for migration generation and Drizzle Studio.

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | `"Database module with Drizzle ORM and pluggable drivers"` | Short project description |
| `DatabaseDriver` | string | `"postgres"` | Default driver (`postgres`, `sqlite`, `turso`, or custom) |

## Project layout

```text
<ProjectName>/
  src/
    db/
      index.ts              # Main export — createDatabase, getDb, disconnectDatabase
      types.ts              # DatabaseConfig interface
      schema.ts             # Example Drizzle schema (users table)
      migrate.ts            # Migration runner
      client.ts             # Singleton DB client with connection management
      drivers/
        types.ts            # DatabaseDriver interface
        registry.ts         # Driver registry
        postgres.ts         # PostgreSQL driver (node-postgres), self-registers
        sqlite.ts           # SQLite driver (better-sqlite3), self-registers
        turso.ts            # Turso/libSQL driver, self-registers
        index.ts            # Barrel import + re-exports
  drizzle.config.ts         # Drizzle Kit configuration for migrations
  package.json
  tsconfig.json
```

## After scaffolding

```bash
# Set your connection string
export DATABASE_URL="postgres://localhost:5432/mydb"

# Generate migrations from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Push schema directly (dev convenience, no migration files)
npm run db:push

# Open Drizzle Studio
npm run db:studio

# Build
npm run build
```

## Migration Workflow

Migration files are stored in the `drizzle/` directory and should be committed to version control. Each migration is timestamped and applied in order.

```bash
# 1. Edit src/db/schema.ts with your table changes

# 2. Generate SQL migration files into drizzle/
npm run db:generate

# 3. Review the generated SQL in drizzle/*.sql

# 4. Apply migrations to the database
npm run db:migrate

# 5. (Dev shortcut) Push schema directly without migration files
npm run db:push
```

Never edit a migration that has already been applied to a shared environment -- create a new one instead.

## Usage

```typescript
import { createDatabase, getDb } from "./db/index.js";

// Explicit connection
const db = await createDatabase({
  driver: "postgres",
  url: "postgres://localhost:5432/mydb",
});

// Or use environment variables (DB_DRIVER + DATABASE_URL)
const db = await getDb();
```

## Adding a custom driver

1. Create a new file in `src/db/drivers/` (use `postgres.ts` as a reference).
2. Implement the `DatabaseDriver` interface: `connect(url, options)`, `disconnect()`.
3. Call `registerDriver(yourDriver)` at the module level.
4. Import your driver file in `src/db/drivers/index.ts` and `src/db/client.ts`.

## Pairs with

- [ts-service](../ts-service/) -- add an HTTP layer on top of the database module
- [agentic-loop](../agentic-loop/) -- give an AI agent database access via tools
- [rag-pipeline](../rag-pipeline/) -- store and query embeddings

## Nests inside

- [monorepo](../monorepo/) -- use as a shared package in a multi-project workspace
