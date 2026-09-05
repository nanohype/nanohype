import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the client facade and driver registry. Out: bootstrap, the startup
      // guard; migrate, which applies migrations to a live database; schema,
      // table declarations; and the postgres, sqlite and turso drivers, which
      // each open a real connection.
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
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
