import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the ingest adapter, mock provider, registry, and circuit breaker.
      // Excluded: barrels, type and schema declarations, the startup check that
      // exits the process, logger and OTel shims, and the vendor providers
      // (notion/confluence/coda/google-docs), each of which requires a service
      // token and a reachable API.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/knowledge-base/bootstrap.ts",
        "src/knowledge-base/config.ts",
        "src/knowledge-base/logger.ts",
        "src/knowledge-base/metrics.ts",
        "src/knowledge-base/providers/coda.ts",
        "src/knowledge-base/providers/confluence.ts",
        "src/knowledge-base/providers/google-docs.ts",
        "src/knowledge-base/providers/notion.ts",
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
