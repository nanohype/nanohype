import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the client facade and driver registry. Live-database drivers
      // (postgres/sqlite/turso), migrations, the schema, and wiring are
      // integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/db/bootstrap.ts",
        "src/db/migrate.ts",
        "src/db/schema.ts",
        "src/db/drivers/postgres.ts",
        "src/db/drivers/sqlite.ts",
        "src/db/drivers/turso.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 64,
      },
    },
  },
});
